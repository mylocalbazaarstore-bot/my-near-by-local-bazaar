// src/controllers/auth/admin.auth.controller.js
// ─────────────────────────────────────────────────────────────
// Admin Authentication Controller — MyLocalBazaar.store
//
// SECURITY: All admin routes require IP whitelisting in production
//
// FLOW (2-Step Login):
//   POST /auth/admin/login             → Step 1: Email + Password → temp_token + 2FA OTP sent
//   POST /auth/admin/verify-2fa        → Step 2: OTP + temp_token → real JWT tokens
//   GET  /auth/admin/me                → Own admin profile
//   POST /auth/admin/create            → Create new admin (superadmin only)
//   PUT  /auth/admin/change-password   → Change own password
//   GET  /auth/admin/sessions          → Active sessions list
//   POST /auth/admin/logout            → Revoke tokens
//   GET  /auth/admin/audit-logs        → Own audit log
// ─────────────────────────────────────────────────────────────

const { AdminAuthService, TokenService } = require('../../services/auth.service');
const { NotificationService }           = require('../../services/notification.service');
const { sendOTP }                       = require('../../utils/otp');
const { query, queryPaginated }         = require('../../config/db');
const {
  success, created, badRequest, unauthorized, forbidden, notFound,
} = require('../../utils/response');
const logger = require('../../config/logger');

// ── POST /auth/admin/login ─────────────────────────────────────
// Step 1 of 2FA: Validates email + password, sends OTP to admin email
// Returns: { temp_token, requires_2fa: true, admin_name }
const login = async (req, res) => {
  const { email, password } = req.body;

  const result = await AdminAuthService.verifyCredentials(email, password, req);

  // Send 2FA OTP email
  if (result.requires_2fa) {
    const otp = require('../../utils/otp');

    // Generate and send OTP to admin email (respects OTP_USE_FIXED_DEV in dev)
    const generatedOtp = otp.generateOTP();
    await otp.storeOTP(result.admin_email, generatedOtp, 'admin_2fa');

    NotificationService.sendAdmin2FAOTP({
      email:     result.admin_email,
      adminName: result.admin_name,
      otp:       generatedOtp,
    }).catch((err) => logger.error('Admin 2FA email failed:', { message: err.message }));

    logger.info('Admin 2FA OTP sent', { email: result.admin_email, ip: req.ip });
  }

  return success(res, {
    temp_token:   result.temp_token,
    requires_2fa: result.requires_2fa,
    admin_name:   result.admin_name,
    message:      result.requires_2fa
      ? 'OTP sent to your registered email. Enter it within 5 minutes.'
      : 'Login successful',
  }, 'Step 1 complete');
};

// ── POST /auth/admin/verify-2fa ───────────────────────────────
// Step 2 of 2FA: Validates OTP + temp token → issues real JWTs
// Request: { temp_token, otp }
const verify2FA = async (req, res) => {
  const { temp_token, otp } = req.body;

  const { admin, tokens } = await AdminAuthService.verify2FA(temp_token, otp, req);

  return success(res, {
    admin: {
      id:           admin.id,
      full_name:    admin.full_name,
      email:        admin.email,
      role:         admin.role,
      permissions:  admin.permissions,
    },
    tokens,
  }, `Welcome back, ${admin.full_name}!`);
};

// ── GET /auth/admin/me ────────────────────────────────────────
const getProfile = async (req, res) => {
  const admin = await AdminAuthService.findById(req.user.id);
  if (!admin) return notFound(res, 'Admin not found');
  return success(res, { admin });
};

// ── POST /auth/admin/create ───────────────────────────────────
// Only superadmin role can call this
const createAdmin = async (req, res) => {
  if (req.user.role !== 'admin') {
    return forbidden(res, 'Only superadmins can create admin accounts');
  }

  // Verify caller is superadmin
  const caller = await AdminAuthService.findById(req.user.id);
  if (!caller || caller.role !== 'superadmin') {
    return forbidden(res, 'Insufficient privileges');
  }

  const admin = await AdminAuthService.createAdmin(req.user.id, req.body);

  return created(res, { admin }, 'Admin account created successfully');
};

// ── PUT /auth/admin/change-password ───────────────────────────
const changePassword = async (req, res) => {
  const { current_password, new_password } = req.body;
  await AdminAuthService.changePassword(req.user.id, current_password, new_password);
  return success(res, null, 'Password changed successfully. Please log in again.');
};

// ── GET /auth/admin/sessions ──────────────────────────────────
const getSessions = async (req, res) => {
  const { rows } = await query(
    `SELECT id, device_info, ip_address, is_active, expires_at, created_at
     FROM user_sessions
     WHERE user_id = $1 AND user_role = 'admin'
     ORDER BY created_at DESC
     LIMIT 20`,
    [req.user.id]
  );
  return success(res, { sessions: rows });
};

// ── POST /auth/admin/logout ───────────────────────────────────
const logout = async (req, res) => {
  const { id, role, jti } = req.user;
  const jwt     = require('jsonwebtoken');
  const decoded = jwt.decode(req.headers.authorization.split(' ')[1]);

  await TokenService.logout(id, role, jti, decoded.exp);

  // Audit log
  await query(
    `INSERT INTO admin_audit_logs (admin_id, action, ip_address)
     VALUES ($1, 'admin_logout', $2)`,
    [id, req.ip]
  );

  logger.info('Admin logged out', { adminId: id, ip: req.ip });
  return success(res, null, 'Logged out successfully');
};

// ── GET /auth/admin/audit-logs ────────────────────────────────
const getAuditLogs = async (req, res) => {
  const { page = 1, limit = 20 } = req.query;

  const result = await queryPaginated(
    `SELECT al.id, al.action, al.entity_type, al.entity_id,
            al.ip_address, al.created_at
     FROM admin_audit_logs al
     WHERE al.admin_id = $1
     ORDER BY al.created_at DESC`,
    [req.user.id],
    { page, limit }
  );

  return success(res, { audit_logs: result.rows }, 'Audit logs fetched', 200, {
    total:      result.total,
    page:       result.page,
    totalPages: result.totalPages,
  });
};

// ── POST /auth/admin/refresh ──────────────────────────────────
const refreshToken = async (req, res) => {
  const tokens = await TokenService.refresh(req.body.refresh_token);
  return success(res, { tokens }, 'Tokens refreshed');
};

module.exports = {
  login,
  verify2FA,
  getProfile,
  createAdmin,
  changePassword,
  getSessions,
  logout,
  getAuditLogs,
  refreshToken,
};
