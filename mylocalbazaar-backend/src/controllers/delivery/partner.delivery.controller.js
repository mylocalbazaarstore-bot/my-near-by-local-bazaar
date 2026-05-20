// src/controllers/delivery/partner.delivery.controller.js
// ─────────────────────────────────────────────────────────────
// Delivery Partner Operations — MyLocalBazaar.store
//
// ENDPOINTS (all require: authenticate + authorize('delivery_partner')):
//   PATCH  /delivery/location            → Live GPS update (every 30s)
//   PATCH  /delivery/status              → Toggle online/offline
//   GET    /delivery/assignments/active  → Current active deliveries
//   GET    /delivery/assignments         → Delivery history (paginated)
//   POST   /delivery/assignments/:id/pickup  → Mark picked up from merchant
//   POST   /delivery/assignments/:id/otp     → Verify customer delivery OTP
//   POST   /delivery/assignments/:id/proof   → Upload proof-of-delivery image
//   POST   /delivery/assignments/:id/failed  → Report failed delivery
//   GET    /delivery/earnings            → Earnings dashboard
//   POST   /delivery/earnings/payout     → Request payout
//
// ADMIN ENDPOINTS (authorize('admin')):
//   POST /delivery/admin/assign          → Assign order to partner
//   GET  /delivery/admin/available       → Nearest available partners
//   GET  /delivery/admin/partners        → All partners list
//   PATCH /delivery/admin/partners/:id/verify → Verify partner
// ─────────────────────────────────────────────────────────────

const {
  LocationService,
  AssignmentService,
  EarningsService,
  toggleOnline,
  DeliveryAuthService,
} = require('../../services/delivery.service');
const { query, queryPaginated } = require('../../config/db');
const { uploadDeliveryProof }  = require('../../config/cloudinary');
const {
  success, created, badRequest, notFound, paginated,
} = require('../../utils/response');
const logger = require('../../config/logger');

// ─────────────────────────────────────────────────────────────
// PARTNER ENDPOINTS
// ─────────────────────────────────────────────────────────────

// ── PATCH /delivery/location ──────────────────────────────────
const updateLocation = async (req, res) => {
  const { latitude, longitude, accuracy, speed } = req.body;
  await LocationService.updateLocation(req.user.id, latitude, longitude);
  return success(res, {
    updated:   true,
    latitude,
    longitude,
    timestamp: new Date().toISOString(),
  }, 'Location updated');
};

// ── PATCH /delivery/status ────────────────────────────────────
const updateStatus = async (req, res) => {
  const { is_online } = req.body;
  const result = await toggleOnline(req.user.id, is_online);
  return success(res, result,
    is_online
      ? '✅ You are now online and will receive delivery requests'
      : '🔴 You are now offline'
  );
};

// ── GET /delivery/assignments/active ─────────────────────────
const getActiveAssignments = async (req, res) => {
  const assignments = await AssignmentService.getActive(req.user.id);
  return success(res, {
    assignments,
    count: assignments.length,
  }, 'Active assignments');
};

// ── GET /delivery/assignments ─────────────────────────────────
const getAssignmentHistory = async (req, res) => {
  const { page = 1, limit = 20, status, from_date, to_date } = req.query;
  const result = await AssignmentService.getHistory(
    req.user.id,
    { status, from_date, to_date },
    { page, limit }
  );
  return paginated(res, result, 'Delivery history');
};

// ── POST /delivery/assignments/:id/pickup ─────────────────────
// Partner confirms they picked up the order from merchant
const confirmPickup = async (req, res) => {
  // :id here is the ORDER id
  const result = await AssignmentService.markPickedUp(req.user.id, req.params.id);
  return success(res, result, '📦 Order picked up! Head to customer location.');
};

// ── POST /delivery/assignments/:id/otp ───────────────────────
// Partner enters OTP from customer at doorstep → marks delivered
const verifyDeliveryOTP = async (req, res) => {
  const { otp } = req.body;
  const result  = await AssignmentService.verifyDeliveryOTP(req.user.id, req.params.id, otp);

  return success(res, result,
    '🎉 OTP verified! Order marked as delivered. Earnings have been credited.'
  );
};

// ── POST /delivery/assignments/:id/proof ─────────────────────
// Multer (Cloudinary) middleware runs before this controller
const uploadProof = async (req, res) => {
  const file = req.file;
  if (!file?.path) return badRequest(res, 'No proof image uploaded');

  const result = await AssignmentService.uploadProof(req.user.id, req.params.id, file.path);
  return success(res, result, 'Proof of delivery uploaded');
};

// ── POST /delivery/assignments/:id/failed ────────────────────
const reportFailed = async (req, res) => {
  const { reason, notes } = req.body;
  await AssignmentService.reportFailed(req.user.id, req.params.id, reason, notes);
  return success(res, null, 'Failed delivery reported. Our team has been notified.');
};

// ── GET /delivery/earnings ────────────────────────────────────
const getEarnings = async (req, res) => {
  const { period = 'week' } = req.query;
  const overview = await EarningsService.getOverview(req.user.id, period);
  return success(res, { earnings: overview }, 'Earnings overview');
};

// ── POST /delivery/earnings/payout ───────────────────────────
const requestPayout = async (req, res) => {
  const { amount } = req.body;
  if (!amount || amount < 100) {
    return badRequest(res, 'Minimum payout amount is ₹100');
  }
  const result = await EarningsService.requestPayout(req.user.id, parseFloat(amount));
  return success(res, result, result.message);
};

// ─────────────────────────────────────────────────────────────
// ADMIN ENDPOINTS
// ─────────────────────────────────────────────────────────────

// ── POST /delivery/admin/assign ───────────────────────────────
const adminAssignDelivery = async (req, res) => {
  const { partner_id, order_id, notes } = req.body;
  const assignment = await AssignmentService.assign(order_id, partner_id, req.user.id, notes);
  return created(res, { assignment }, 'Delivery partner assigned successfully');
};

// ── GET /delivery/admin/available ────────────────────────────
// Returns nearest online verified partners for a given order location
const getAvailablePartners = async (req, res) => {
  const { latitude, longitude, radius_km = 5, limit = 10 } = req.query;

  if (!latitude || !longitude) {
    return badRequest(res, 'latitude and longitude are required');
  }

  const partners = await LocationService.findNearest(
    parseFloat(latitude),
    parseFloat(longitude),
    parseFloat(radius_km),
    parseInt(limit)
  );

  return success(res, {
    partners,
    count:     partners.length,
    searched:  { latitude, longitude, radius_km },
  }, 'Available partners found');
};

// ── GET /delivery/admin/partners ──────────────────────────────
const getAllPartners = async (req, res) => {
  const { page = 1, limit = 20, is_verified, is_online, search } = req.query;
  const params  = [];
  const clauses = [];

  if (is_verified !== undefined) {
    params.push(is_verified === 'true');
    clauses.push(`dp.is_verified = $${params.length}`);
  }
  if (is_online !== undefined) {
    params.push(is_online === 'true');
    clauses.push(`dp.is_online = $${params.length}`);
  }
  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    clauses.push(`(LOWER(dp.full_name) LIKE $${params.length} OR dp.phone LIKE $${params.length})`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const result = await queryPaginated(
    `SELECT
       dp.id, dp.full_name, dp.phone, dp.email,
       dp.vehicle_type, dp.vehicle_number,
       dp.is_online, dp.is_verified, dp.is_active,
       dp.rating, dp.total_deliveries, dp.wallet_balance,
       dp.current_latitude, dp.current_longitude,
       dp.created_at,
       (SELECT COUNT(*) FROM delivery_assignments da
        WHERE da.partner_id = dp.id AND da.delivery_status IN ('assigned','picked_up','in_transit'))::int
        AS active_assignments
     FROM delivery_partners dp
     ${where}
     ORDER BY dp.is_online DESC, dp.total_deliveries DESC`,
    params,
    { page, limit }
  );

  return paginated(res, result, 'Delivery partners');
};

// ── PATCH /delivery/admin/partners/:id/verify ─────────────────
const verifyPartner = async (req, res) => {
  const { id } = req.params;
  const { verify, notes } = req.body;

  const { rows } = await query(
    `UPDATE delivery_partners
     SET is_verified = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING id, full_name, is_verified`,
    [!!verify, id]
  );

  if (!rows[0]) return notFound(res, 'Delivery partner not found');

  // Audit log
  await query(
    `INSERT INTO admin_audit_logs (admin_id, action, entity_type, entity_id, new_values)
     VALUES ($1, $2, 'delivery_partners', $3, $4)`,
    [req.user.id, verify ? 'verified_partner' : 'unverified_partner', id,
     JSON.stringify({ is_verified: !!verify, notes })]
  );

  logger.info(`Delivery partner ${verify ? 'verified' : 'unverified'}`, { partnerId: id, adminId: req.user.id });
  return success(res, { partner: rows[0] },
    verify ? '✅ Partner verified and can now receive deliveries' : 'Partner verification revoked'
  );
};

// ── GET /delivery/admin/partners/:id/location ─────────────────
const getPartnerLiveLocation = async (req, res) => {
  const location = await LocationService.getLocation(req.params.id);
  if (!location) return notFound(res, 'Location data not available for this partner');
  return success(res, { location });
};

module.exports = {
  // Partner
  updateLocation, updateStatus,
  getActiveAssignments, getAssignmentHistory,
  confirmPickup, verifyDeliveryOTP, uploadProof, reportFailed,
  getEarnings, requestPayout,
  // Admin
  adminAssignDelivery, getAvailablePartners,
  getAllPartners, verifyPartner, getPartnerLiveLocation,
};
