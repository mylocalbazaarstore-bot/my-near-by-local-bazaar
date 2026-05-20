// src/services/push.service.js
// ─────────────────────────────────────────────────────────────
// Push Notification Service — MyLocalBazaar.store
//
// Channels supported:
//   1. FCM (Firebase Cloud Messaging) → iOS / Android apps
//   2. Fast2SMS → Bulk SMS campaigns + transactional SMS
//   3. In-app (DB table) → notifications API for web
//   4. WhatsApp → via Meta Cloud API (in notification.service.js)
//
// All sends are NON-BLOCKING — failures are logged, never thrown.
// ─────────────────────────────────────────────────────────────

const axios  = require('axios');
const { query } = require('../config/db');
const { initFirebase } = require('../config/firebase');
const logger = require('../config/logger');

// ─────────────────────────────────────────────────────────────
// FCM PUSH NOTIFICATIONS
// ─────────────────────────────────────────────────────────────
const FCMService = {

  // Send to a single device token
  sendToDevice: async ({ token, title, body, data = {}, imageUrl = null }) => {
    const admin = initFirebase();
    if (!admin || !token) return { sent: false, reason: 'FCM not configured or no token' };

    try {
      const message = {
        token,
        notification: { title, body, ...(imageUrl && { imageUrl }) },
        data: Object.fromEntries(
          Object.entries(data).map(([k, v]) => [k, String(v)])
        ),
        android: {
          priority: 'high',
          notification: {
            channelId: 'mlb_default',
            clickAction: 'FLUTTER_NOTIFICATION_CLICK',
            sound: 'default',
          },
        },
        apns: {
          payload: {
            aps: { alert: { title, body }, badge: 1, sound: 'default' },
          },
        },
      };

      const response = await admin.messaging().send(message);
      logger.debug('FCM push sent', { token: token.substring(0, 20), messageId: response });
      return { sent: true, messageId: response };
    } catch (err) {
      // Token invalid/expired — clean it up
      if (err.code === 'messaging/registration-token-not-registered') {
        await FCMService.removeToken(token);
      }
      logger.warn('FCM send failed:', { message: err.message, token: token.substring(0, 20) });
      return { sent: false, error: err.message };
    }
  },

  // Send to multiple tokens (multicast — up to 500)
  sendMulticast: async ({ tokens, title, body, data = {}, imageUrl = null }) => {
    const admin = initFirebase();
    if (!admin || !tokens?.length) return { sent: false, successCount: 0 };

    try {
      const message = {
        tokens,
        notification: { title, body, ...(imageUrl && { imageUrl }) },
        data: Object.fromEntries(
          Object.entries(data).map(([k, v]) => [k, String(v)])
        ),
        android: { priority: 'high' },
        apns: { payload: { aps: { badge: 1, sound: 'default' } } },
      };

      const response = await admin.messaging().sendEachForMulticast(message);

      // Remove invalid tokens
      const invalidTokens = [];
      response.responses.forEach((r, i) => {
        if (!r.success && r.error?.code === 'messaging/registration-token-not-registered') {
          invalidTokens.push(tokens[i]);
        }
      });
      if (invalidTokens.length) {
        await Promise.all(invalidTokens.map((t) => FCMService.removeToken(t)));
      }

      logger.info('FCM multicast sent', {
        total:        tokens.length,
        successCount: response.successCount,
        failureCount: response.failureCount,
      });

      return {
        sent:         true,
        successCount: response.successCount,
        failureCount: response.failureCount,
      };
    } catch (err) {
      logger.error('FCM multicast failed:', { message: err.message });
      return { sent: false, successCount: 0 };
    }
  },

  // Send to a topic (all subscribed users e.g. 'kharghar_offers')
  sendToTopic: async ({ topic, title, body, data = {} }) => {
    const admin = initFirebase();
    if (!admin) return { sent: false };

    try {
      const response = await admin.messaging().send({
        topic,
        notification: { title, body },
        data: Object.fromEntries(
          Object.entries(data).map(([k, v]) => [k, String(v)])
        ),
      });
      logger.info('FCM topic message sent', { topic, messageId: response });
      return { sent: true, messageId: response };
    } catch (err) {
      logger.error('FCM topic send failed:', { topic, message: err.message });
      return { sent: false };
    }
  },

  // Remove an invalid FCM token from DB
  removeToken: async (token) => {
    try {
      await query(
        `DELETE FROM user_sessions WHERE device_info->>'fcm_token' = $1`,
        [token]
      );
    } catch { /* non-fatal */ }
  },
};

// ─────────────────────────────────────────────────────────────
// SMS SERVICE (Fast2SMS — India)
// ─────────────────────────────────────────────────────────────
const SMSService = {

  // Send single transactional SMS
  sendSingle: async (phone, message) => {
    if (!process.env.FAST2SMS_API_KEY) {
      logger.warn('Fast2SMS not configured — skipping SMS');
      return { sent: false };
    }
    if (process.env.NODE_ENV !== 'production' && process.env.OTP_USE_FIXED_DEV === 'true') {
      logger.info(`[DEV SMS] To: ${phone} | Message: ${message}`);
      return { sent: true, provider: 'dev' };
    }

    try {
      const response = await axios.post(
        'https://www.fast2sms.com/dev/bulkV2',
        { message, route: 'q', numbers: phone, flash: 0 },
        {
          headers: { authorization: process.env.FAST2SMS_API_KEY },
          timeout: 8000,
        }
      );
      logger.info('SMS sent', { phone: phone.slice(0, 7) + '***' });
      return { sent: true, response: response.data };
    } catch (err) {
      logger.warn('SMS failed:', { message: err.message });
      return { sent: false, error: err.message };
    }
  },

  // Bulk campaign (up to 1000 numbers)
  sendBulk: async (phones, message, campaignId = null) => {
    if (!process.env.FAST2SMS_API_KEY) return { sent: false };

    const batches = [];
    for (let i = 0; i < phones.length; i += 100) {
      batches.push(phones.slice(i, i + 100));
    }

    let totalSent = 0;
    for (const batch of batches) {
      try {
        await axios.post(
          'https://www.fast2sms.com/dev/bulkV2',
          { message, route: 'q', numbers: batch.join(','), flash: 0 },
          { headers: { authorization: process.env.FAST2SMS_API_KEY }, timeout: 15000 }
        );
        totalSent += batch.length;
        await new Promise((r) => setTimeout(r, 500)); // Rate limit between batches
      } catch (err) {
        logger.warn('Bulk SMS batch failed:', { batchSize: batch.length, error: err.message });
      }
    }

    logger.info('Bulk SMS campaign completed', {
      campaignId,
      total:  phones.length,
      sent:   totalSent,
      failed: phones.length - totalSent,
    });

    return { sent: true, totalSent, failed: phones.length - totalSent };
  },
};

// ─────────────────────────────────────────────────────────────
// IN-APP NOTIFICATION SERVICE
// ─────────────────────────────────────────────────────────────
const InAppService = {

  // Insert notification record to DB
  create: async ({
    recipientId, recipientType, type, title, body, data = {},
    sendPush = false, sendSMS = false, fcmToken = null, phone = null,
  }) => {
    let notifId = null;
    try {
      const { rows } = await query(
        `INSERT INTO notifications
           (recipient_id, recipient_type, notification_type, title, body, data,
            is_sent_push, is_sent_sms)
         VALUES ($1, $2, $3, $4, $5, $6, false, false)
         RETURNING id`,
        [
          recipientId, recipientType, type, title, body,
          JSON.stringify(data),
        ]
      );
      notifId = rows[0].id;
    } catch (err) {
      logger.warn('In-app notification insert failed:', { message: err.message });
    }

    // Fire push + SMS in parallel (non-blocking)
    const promises = [];

    if (sendPush && fcmToken) {
      promises.push(
        FCMService.sendToDevice({ token: fcmToken, title, body, data })
          .then(async (r) => {
            if (notifId && r.sent) {
              await query(
                'UPDATE notifications SET is_sent_push = true, sent_at = NOW() WHERE id = $1',
                [notifId]
              );
            }
          })
      );
    }

    if (sendSMS && phone) {
      promises.push(
        SMSService.sendSingle(phone, `${title}: ${body}`)
          .then(async (r) => {
            if (notifId && r.sent) {
              await query(
                'UPDATE notifications SET is_sent_sms = true WHERE id = $1',
                [notifId]
              );
            }
          })
      );
    }

    if (promises.length) {
      Promise.allSettled(promises).catch(() => {}); // Fire and forget
    }

    return { notifId };
  },

  // Notify multiple users (e.g. all merchants in an area)
  broadcast: async ({ recipientIds, recipientType, type, title, body, data = {} }) => {
    if (!recipientIds?.length) return;

    // Batch insert
    const values = recipientIds
      .map((_, i) => `($${i * 6 + 1},$${i * 6 + 2},$${i * 6 + 3},$${i * 6 + 4},$${i * 6 + 5},$${i * 6 + 6})`)
      .join(',');
    const params = recipientIds.flatMap((id) => [
      id, recipientType, type, title, body, JSON.stringify(data),
    ]);

    await query(
      `INSERT INTO notifications
         (recipient_id, recipient_type, notification_type, title, body, data)
       VALUES ${values}`,
      params
    );

    logger.info('Broadcast notification sent', { count: recipientIds.length, type });
  },
};

// ─────────────────────────────────────────────────────────────
// NOTIFICATION TEMPLATES
// Pre-built messages for common events — call these everywhere
// ─────────────────────────────────────────────────────────────
const Templates = {

  // ── Order events ────────────────────────────────────────────
  orderPlaced: (order) => ({
    title: '🛒 Order Placed!',
    body:  `Your order ${order.order_number} for ₹${order.total_amount} is confirmed.`,
    data:  { order_id: order.id, screen: 'order_detail' },
  }),

  orderApproved: (order) => ({
    title: '✅ Order Approved!',
    body:  `${order.store_name} accepted your order ${order.order_number}. Being prepared now!`,
    data:  { order_id: order.id, screen: 'order_detail' },
  }),

  orderRejected: (order) => ({
    title: '❌ Order Cancelled',
    body:  `${order.store_name} couldn't fulfil ${order.order_number}. Refund will be processed.`,
    data:  { order_id: order.id, screen: 'order_detail' },
  }),

  orderPacked: (order) => ({
    title: '📦 Order Packed',
    body:  `Your order ${order.order_number} is packed and ready for pickup!`,
    data:  { order_id: order.id, screen: 'order_detail' },
  }),

  orderOutForDelivery: (order) => ({
    title: '🚴 Out for Delivery!',
    body:  `Your order ${order.order_number} is on its way. OTP: ${order.delivery_otp}`,
    data:  { order_id: order.id, otp: order.delivery_otp, screen: 'order_detail' },
  }),

  orderDelivered: (order) => ({
    title: '🎉 Delivered!',
    body:  `Order ${order.order_number} delivered. Enjoy your purchase! Rate your experience.`,
    data:  { order_id: order.id, screen: 'rate_order' },
  }),

  // ── Merchant events ─────────────────────────────────────────
  newOrderForMerchant: (order) => ({
    title: '🛒 New Order — Action Required!',
    body:  `Order ${order.order_number} for ₹${order.total_amount}. Approve within 30 minutes.`,
    data:  { order_id: order.id, screen: 'merchant_orders' },
  }),

  lowStockAlert: (product) => ({
    title: '⚠️ Low Stock Alert',
    body:  `"${product.name}" has only ${product.stock_quantity} units left. Restock soon!`,
    data:  { product_id: product.id, screen: 'merchant_products' },
  }),

  settlementCredited: (amount) => ({
    title: '💰 Payment Received',
    body:  `₹${amount} has been credited to your merchant wallet.`,
    data:  { screen: 'merchant_wallet' },
  }),

  // ── Delivery partner events ──────────────────────────────────
  deliveryAssigned: (order) => ({
    title: '📦 New Delivery Assigned!',
    body:  `Pick up order ${order.order_number} from ${order.store_name}. ₹${order.total_amount}`,
    data:  { order_id: order.id, screen: 'delivery_active' },
  }),

  earningsCredited: (amount) => ({
    title: '💵 Earnings Credited',
    body:  `₹${amount} added to your delivery wallet for completing a delivery.`,
    data:  { screen: 'delivery_earnings' },
  }),

  // ── Marketing ───────────────────────────────────────────────
  newOfferNearby: (offer) => ({
    title: `🏷️ ${offer.discount}% OFF at ${offer.store_name}!`,
    body:  offer.description,
    data:  { merchant_id: offer.merchant_id, screen: 'store_detail' },
  }),

  walletCredited: (amount) => ({
    title: '🎁 Wallet Credited!',
    body:  `₹${amount} added to your MyLocalBazaar wallet. Shop now!`,
    data:  { screen: 'wallet' },
  }),
};

module.exports = { FCMService, SMSService, InAppService, Templates };
