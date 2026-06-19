// src/controllers/notifications/notification.controller.js
// ─────────────────────────────────────────────────────────────
// Notification Controller — MyLocalBazaar.store
//
// CUSTOMER/MERCHANT/DELIVERY ENDPOINTS:
//   GET    /notifications              → List own notifications (paginated)
//   PATCH  /notifications/:id/read    → Mark one as read
//   PATCH  /notifications/read-all    → Mark all as read
//   DELETE /notifications/:id         → Delete notification
//   POST   /notifications/register-token → Register FCM device token
//   GET    /notifications/unread-count   → Unread badge count
//
// ADMIN ENDPOINTS:
//   POST /notifications/admin/campaign   → Send SMS/push campaign to segment
//   POST /notifications/admin/broadcast  → Broadcast to all users of a role
// ─────────────────────────────────────────────────────────────

const { query, queryPaginated } = require('../../config/db');
const { FCMService, SMSService, InAppService, Templates } = require('../../services/push.service');
const { success, created, notFound, badRequest, paginated } = require('../../utils/response');
const logger = require('../../config/logger');

// ── GET /notifications ────────────────────────────────────────
const listNotifications = async (req, res) => {
  const { page = 1, limit = 20, type } = req.query;
  const { id: recipientId, role } = req.user;

  const params  = [recipientId, role];
  const clauses = ['recipient_id = $1', 'recipient_type = $2'];

  if (type) {
    params.push(type);
    clauses.push(`notification_type = $${params.length}`);
  }

  const result = await queryPaginated(
    `SELECT id, notification_type, title, body, data, is_read, created_at
     FROM notifications
     WHERE ${clauses.join(' AND ')}
     ORDER BY created_at DESC`,
    params,
    { page, limit }
  );

  return paginated(res, result, 'Notifications fetched');
};

// ── GET /notifications/unread-count ──────────────────────────
const getUnreadCount = async (req, res) => {
  const { rows } = await query(
    `SELECT COUNT(*) AS count
     FROM notifications
     WHERE recipient_id = $1 AND recipient_type = $2 AND is_read = false`,
    [req.user.id, req.user.role]
  );
  return success(res, { count: parseInt(rows[0].count) });
};

// ── PATCH /notifications/:id/read ────────────────────────────
const markRead = async (req, res) => {
  const { rowCount } = await query(
    `UPDATE notifications
     SET is_read = true, read_at = NOW()
     WHERE id = $1 AND recipient_id = $2`,
    [req.params.id, req.user.id]
  );
  if (!rowCount) return notFound(res, 'Notification not found');
  return success(res, null, 'Marked as read');
};

// ── PATCH /notifications/read-all ────────────────────────────
const markAllRead = async (req, res) => {
  const { rowCount } = await query(
    `UPDATE notifications
     SET is_read = true, read_at = NOW()
     WHERE recipient_id = $1 AND recipient_type = $2 AND is_read = false`,
    [req.user.id, req.user.role]
  );
  return success(res, { updated: rowCount }, `${rowCount} notifications marked as read`);
};

// ── DELETE /notifications/:id ─────────────────────────────────
const deleteNotification = async (req, res) => {
  const { rowCount } = await query(
    'DELETE FROM notifications WHERE id = $1 AND recipient_id = $2',
    [req.params.id, req.user.id]
  );
  if (!rowCount) return notFound(res, 'Notification not found');
  return success(res, null, 'Notification deleted');
};

// ── POST /notifications/register-token ───────────────────────
// Mobile apps call this on login to register their FCM device token
const registerToken = async (req, res) => {
  const { fcm_token, device_type, device_id } = req.body;
  if (!fcm_token) return badRequest(res, 'fcm_token is required');

  // Upsert into user_sessions with FCM token in device_info
  await query(
    `INSERT INTO user_sessions
       (user_id, user_role, token_hash, device_info, expires_at)
     VALUES ($1, $2, $3, $4, NOW() + INTERVAL '365 days')
     ON CONFLICT (token_hash) DO UPDATE
       SET device_info = EXCLUDED.device_info, updated_at = NOW()`,
    [
      req.user.id,
      req.user.role,
      `fcm_${fcm_token.substring(0, 32)}`,
      JSON.stringify({ fcm_token, device_type: device_type || 'unknown', device_id }),
    ]
  );

  logger.debug('FCM token registered', { userId: req.user.id, deviceType: device_type });
  return success(res, null, 'Device token registered for push notifications');
};

// ─────────────────────────────────────────────────────────────
// ADMIN: CAMPAIGN & BROADCAST
// ─────────────────────────────────────────────────────────────

// ── POST /notifications/admin/campaign ───────────────────────
// Send targeted SMS + push campaign to a user segment
const sendCampaign = async (req, res) => {
  const {
    title, body, channel = 'both',
    target_role,     // 'customer' | 'merchant' | 'delivery_partner' | 'all'
    target_area_id,  // optional area filter
    target_category, // optional merchant category filter
    coupon_code,     // optional — appended to message
  } = req.body;

  if (!title || !body) return badRequest(res, 'title and body are required');

  const message = coupon_code
    ? `${body} Use code ${coupon_code} to avail offer.`
    : body;

  // Fetch target recipients
  let customerPhones = [];
  let merchantPhones = [];
  let customerTokens = [];

  if (target_role === 'all' || target_role === 'customer') {
    const customerParams = [];
    const customerFilters = ['u.is_active = true', 'u.is_blocked = false'];
    if (target_area_id) {
      customerParams.push(target_area_id);
      customerFilters.push(`EXISTS (
         SELECT 1 FROM user_addresses ua
         WHERE ua.user_id = u.id AND ua.area_id = $${customerParams.length}
       )`);
    }

    const { rows } = await query(
      `SELECT u.phone, us.device_info->>'fcm_token' AS fcm_token
       FROM users u
       LEFT JOIN user_sessions us ON us.user_id = u.id AND us.user_role = 'customer'
       WHERE ${customerFilters.join(' AND ')}
       LIMIT 5000`,
      customerParams
    );
    customerPhones = rows.map((r) => r.phone).filter(Boolean);
    customerTokens = rows.map((r) => r.fcm_token).filter(Boolean);
  }

  if (target_role === 'all' || target_role === 'merchant') {
    const merchantParams = [];
    const merchantFilters = ["merchant_status = 'active'"];
    if (target_category) {
      merchantParams.push(target_category);
      merchantFilters.push(`store_category = $${merchantParams.length}`);
    }

    const { rows } = await query(
      `SELECT phone FROM merchants
       WHERE ${merchantFilters.join(' AND ')}
       LIMIT 2000`,
      merchantParams
    );
    merchantPhones = rows.map((r) => r.phone).filter(Boolean);
  }

  const allPhones = [...new Set([...customerPhones, ...merchantPhones])];
  const allTokens = [...new Set(customerTokens)];

  let smsResult   = { sent: false, totalSent: 0 };
  let pushResult  = { sent: false, successCount: 0 };

  if ((channel === 'sms' || channel === 'both') && allPhones.length > 0) {
    smsResult = await SMSService.sendBulk(allPhones, message, `campaign_${Date.now()}`);
  }

  if ((channel === 'push' || channel === 'both') && allTokens.length > 0) {
    // Send in batches of 500 (FCM limit per multicast)
    for (let i = 0; i < allTokens.length; i += 500) {
      const batch  = allTokens.slice(i, i + 500);
      const result = await FCMService.sendMulticast({ tokens: batch, title, body, data: { coupon_code } });
      pushResult.successCount += result.successCount || 0;
    }
    pushResult.sent = true;
  }

  // Record campaign in DB for analytics
  await InAppService.broadcast({
    recipientIds:  [], // handled by direct FCM multicast above
    recipientType: target_role || 'customer',
    type:          'promotion',
    title,
    body:          message,
    data:          { coupon_code },
  });

  logger.info('Campaign sent', {
    adminId:   req.user.id,
    title,
    sms_sent:  smsResult.totalSent,
    push_sent: pushResult.successCount,
    total_targets: allPhones.length,
  });

  return success(res, {
    campaign: {
      title,
      total_targets: allPhones.length,
      sms:  smsResult,
      push: pushResult,
    },
  }, 'Campaign dispatched successfully');
};

// ── POST /notifications/admin/broadcast ──────────────────────
// Quick broadcast to ALL users of a role
const broadcastToRole = async (req, res) => {
  const { title, body, role = 'customer', notification_type = 'promotion' } = req.body;
  if (!title || !body) return badRequest(res, 'title and body are required');

  // Get all user IDs for role
  let recipientIds = [];
  if (role === 'customer') {
    const { rows } = await query(
      'SELECT id FROM users WHERE is_active = true AND is_blocked = false LIMIT 10000'
    );
    recipientIds = rows.map((r) => r.id);
  } else if (role === 'merchant') {
    const { rows } = await query(
      "SELECT id FROM merchants WHERE merchant_status = 'active' LIMIT 5000"
    );
    recipientIds = rows.map((r) => r.id);
  } else if (role === 'delivery_partner') {
    const { rows } = await query(
      'SELECT id FROM delivery_partners WHERE is_active = true LIMIT 2000'
    );
    recipientIds = rows.map((r) => r.id);
  }

  await InAppService.broadcast({ recipientIds, recipientType: role, type: notification_type, title, body });

  logger.info('Broadcast sent', { adminId: req.user.id, role, count: recipientIds.length, title });

  return success(res, {
    broadcast: { title, role, recipient_count: recipientIds.length },
  }, `Broadcast sent to ${recipientIds.length} ${role}s`);
};

// ── POST /notifications/admin/test-push ──────────────────────
// Admin tests push to a specific FCM token
const testPush = async (req, res) => {
  const { fcm_token, title = 'Test Notification', body = 'MyLocalBazaar push is working!' } = req.body;
  if (!fcm_token) return badRequest(res, 'fcm_token is required');

  const result = await FCMService.sendToDevice({ token: fcm_token, title, body });
  return success(res, { result }, result.sent ? 'Test push sent!' : 'Push failed — check token');
};

module.exports = {
  listNotifications, getUnreadCount, markRead, markAllRead,
  deleteNotification, registerToken,
  sendCampaign, broadcastToRole, testPush,
};
