// src/services/auth.service.js
// ─────────────────────────────────────────────────────────────
// Auth Service — MyLocalBazaar.store
// Business logic layer for Customer | Merchant | Admin auth
// Controllers call services; services call DB — clean separation
// ─────────────────────────────────────────────────────────────

const bcrypt  = require('bcryptjs');
const { query, withTransaction } = require('../config/db');
const { redis }                  = require('../config/redis');
const {
  createAccessToken,
  createRefreshToken,
  verifyRefreshToken,
  generateReferralCode,
  generateSlug,
} = require('../utils/generators');
const logger = require('../config/logger');

const BCRYPT_ROUNDS = 12;

// ═══════════════════════════════════════════════════════════════
// ── SHARED HELPERS ────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════

const hashPassword = (plain) => bcrypt.hash(plain, BCRYPT_ROUNDS);
const comparePassword = (plain, hash) => bcrypt.compare(plain, hash);

// Store refresh token in Redis with 30d TTL
const storeRefreshToken = async (userId, role, jti) => {
  const key = `mlb:refresh:${userId}:${role}`;
  const ttl = 30 * 24 * 60 * 60; // 30 days in seconds
  await redis.set(key, jti, ttl);
};

// Build token pair response object
const buildTokenPair = async (userId, role) => {
  const { token: accessToken, jti: accessJti }   = createAccessToken(userId, role);
  const { token: refreshToken, jti: refreshJti } = createRefreshToken(userId, role);
  await storeRefreshToken(userId, role, refreshJti);
  return { access_token: accessToken, refresh_token: refreshToken, token_type: 'Bearer' };
};

// Log session to DB (for device tracking)
const logSession = async (userId, role, req) => {
  try {
    await query(
      `INSERT INTO user_sessions (user_id, user_role, token_hash, device_info, ip_address, expires_at)
       VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '7 days')`,
      [
        userId,
        role,
        require('crypto').randomBytes(16).toString('hex'), // lightweight placeholder
        JSON.stringify({
          ip:         req.ip,
          userAgent:  req.get('User-Agent') || 'unknown',
          os:         req.get('User-Agent') || 'unknown',
        }),
        req.ip,
      ]
    );
  } catch (err) {
    // Non-fatal — don't fail login if session log fails
    logger.warn('Session log failed:', { message: err.message });
  }
};

// ═══════════════════════════════════════════════════════════════
// ── CUSTOMER AUTH SERVICE ─────────────────────────────────────
// ═══════════════════════════════════════════════════════════════

const CustomerAuthService = {

  // Find customer by phone — returns null if not found
  findByPhone: async (phone) => {
    const { rows } = await query(
      'SELECT * FROM users WHERE phone = $1 LIMIT 1',
      [phone]
    );
    return rows[0] || null;
  },

  // Find by ID (for profile fetch)
  findById: async (id) => {
    const { rows } = await query(
      `SELECT id, full_name, email, phone, gender, date_of_birth,
              profile_image_url, referral_code, wallet_balance,
              is_email_verified, is_phone_verified, is_active,
              last_login_at, created_at
       FROM users WHERE id = $1 LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  },

  // Create new customer after first OTP verification
  create: async (phone, profileData = {}) => {
    const referralCode = generateReferralCode(profileData.full_name || 'MLB');

    const { rows } = await query(
      `INSERT INTO users
         (full_name, phone, email, gender, date_of_birth, referral_code, referred_by,
          is_phone_verified, wallet_balance)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true, 0.00)
       RETURNING id, full_name, phone, email, referral_code, wallet_balance, created_at`,
      [
        profileData.full_name    || 'MLB User',
        phone,
        profileData.email        || null,
        profileData.gender       || null,
        profileData.date_of_birth || null,
        referralCode,
        profileData.referred_by  || null,
      ]
    );

    // Initialize wallet record
    await query(
      `INSERT INTO wallets (owner_id, owner_type) VALUES ($1, 'customer') ON CONFLICT DO NOTHING`,
      [rows[0].id]
    );

    logger.info('New customer created', { userId: rows[0].id, phone });
    return rows[0];
  },

  // Complete/update profile (called after first login)
  completeProfile: async (userId, data) => {
    // Resolve referral code → referred_by id
    let referredById = null;
    if (data.referral_code) {
      const { rows } = await query(
        'SELECT id FROM users WHERE referral_code = $1 AND id != $2 LIMIT 1',
        [data.referral_code.toUpperCase(), userId]
      );
      if (rows[0]) referredById = rows[0].id;
    }

    const { rows } = await query(
      `UPDATE users
       SET full_name      = COALESCE($1, full_name),
           email          = COALESCE($2, email),
           gender         = COALESCE($3, gender),
           date_of_birth  = COALESCE($4, date_of_birth),
           referred_by    = COALESCE($5, referred_by),
           updated_at     = NOW()
       WHERE id = $6
       RETURNING id, full_name, email, phone, gender, date_of_birth,
                 referral_code, wallet_balance`,
      [data.full_name, data.email, data.gender, data.date_of_birth, referredById, userId]
    );
    return rows[0];
  },

  // Update last_login_at timestamp
  updateLastLogin: async (userId) => {
    await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [userId]);
  },

  // OTP login — returns { user, isNewUser, tokens }
  loginOrRegister: async (phone, req) => {
    let user      = await CustomerAuthService.findByPhone(phone);
    let isNewUser = false;

    if (!user) {
      user      = await CustomerAuthService.create(phone);
      isNewUser = true;
    } else if (!user.is_active) {
      throw Object.assign(new Error('Your account has been blocked. Contact support.'), { statusCode: 403 });
    }

    await CustomerAuthService.updateLastLogin(user.id);
    await logSession(user.id, 'customer', req);

    const tokens = await buildTokenPair(user.id, 'customer');
    return { user, isNewUser, tokens };
  },
};

// ═══════════════════════════════════════════════════════════════
// ── MERCHANT AUTH SERVICE ─────────────────────────────────────
// ═══════════════════════════════════════════════════════════════

const MerchantAuthService = {

  findByPhone: async (phone) => {
    const { rows } = await query(
      'SELECT * FROM merchants WHERE phone = $1 LIMIT 1',
      [phone]
    );
    return rows[0] || null;
  },

  findById: async (id) => {
    const { rows } = await query(
      `SELECT id, owner_name, email, phone, store_name, store_slug, store_category,
              store_logo_url, store_banner_url, store_description,
              gstin, pan_number, udyog_aadhaar,
              address_line1, address_line2, landmark, area_id, pincode,
              latitude, longitude, delivery_radius_km, min_order_value,
              is_open, accepts_cod, emergency_booking,
              kyc_status, merchant_status, subscription_plan,
              rating, total_reviews, is_featured, last_login_at, created_at
       FROM merchants WHERE id = $1 LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  },

  phoneExists: async (phone) => {
    const { rows } = await query(
      'SELECT id FROM merchants WHERE phone = $1 LIMIT 1', [phone]
    );
    return !!rows[0];
  },

  // Generate a unique store slug from store name
  generateUniqueSlug: async (storeName) => {
    const slugify = require('slugify');
    let baseSlug = slugify(storeName, { lower: true, strict: true, trim: true });
    let slug     = baseSlug;
    let counter  = 1;

    while (true) {
      const { rows } = await query(
        'SELECT id FROM merchants WHERE store_slug = $1 LIMIT 1', [slug]
      );
      if (!rows[0]) break;
      slug = `${baseSlug}-${counter++}`;
    }
    return slug;
  },

  // Full merchant registration (called after OTP verified)
  register: async (phone, data) => {
    return await withTransaction(async (client) => {
      const storeSlug    = await MerchantAuthService.generateUniqueSlug(data.store_name);
      const passwordHash = await hashPassword(data.password);

      // Insert merchant row
      const { rows } = await client.query(
        `INSERT INTO merchants
           (owner_name, email, phone, password_hash, store_name, store_slug,
            store_category, store_description,
            address_line1, address_line2, landmark, pincode, area_id,
            latitude, longitude,
            min_order_value, delivery_radius_km, accepts_cod,
            gstin, pan_number, udyog_aadhaar,
            kyc_status, merchant_status)
         VALUES
           ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,'pending','pending')
         RETURNING id, owner_name, phone, email, store_name, store_slug,
                   store_category, kyc_status, merchant_status, created_at`,
        [
          data.owner_name,
          data.email        || null,
          phone,
          passwordHash,
          data.store_name,
          storeSlug,
          data.store_category,
          data.store_description || null,
          data.address_line1,
          data.address_line2     || null,
          data.landmark          || null,
          data.pincode,
          data.area_id           || null,
          data.latitude          || null,
          data.longitude         || null,
          data.min_order_value   || 0,
          data.delivery_radius_km || 5,
          data.accepts_cod !== false,
          data.gstin             || null,
          data.pan_number        || null,
          data.udyog_aadhaar     || null,
        ]
      );

      const merchant = rows[0];

      // Create merchant wallet
      await client.query(
        `INSERT INTO wallets (owner_id, owner_type) VALUES ($1, 'merchant')`,
        [merchant.id]
      );

      // Create empty KYC record
      await client.query(
        `INSERT INTO merchant_kyc (merchant_id) VALUES ($1)`,
        [merchant.id]
      );

      // Create default 7-day operating hours (9am–9pm, open daily)
      const hoursValues = Array.from({ length: 7 }, (_, i) => i)
        .map((day) => `(gen_random_uuid(), '${merchant.id}', ${day}, '09:00', '21:00', false)`)
        .join(',');
      await client.query(
        `INSERT INTO merchant_operating_hours (id, merchant_id, day_of_week, open_time, close_time, is_closed)
         VALUES ${hoursValues}`
      );

      logger.info('New merchant registered', { merchantId: merchant.id, store: merchant.store_name });
      return merchant;
    });
  },

  // Password-based login (merchants have passwords unlike customers)
  login: async (phone, plainPassword, req) => {
    const merchant = await MerchantAuthService.findByPhone(phone);
    if (!merchant) {
      throw Object.assign(new Error('Invalid phone number or password'), { statusCode: 401 });
    }

    if (merchant.merchant_status === 'disabled' || merchant.merchant_status === 'rejected') {
      throw Object.assign(
        new Error('Your merchant account has been disabled. Contact support@mylocalbazaar.store'),
        { statusCode: 403 }
      );
    }

    if (merchant.merchant_status === 'suspended') {
      throw Object.assign(
        new Error('Your account is suspended. Please contact support.'),
        { statusCode: 403 }
      );
    }

    const passwordMatch = await comparePassword(plainPassword, merchant.password_hash);
    if (!passwordMatch) {
      throw Object.assign(new Error('Invalid phone number or password'), { statusCode: 401 });
    }

    // Update last login
    await query('UPDATE merchants SET last_login_at = NOW() WHERE id = $1', [merchant.id]);
    await logSession(merchant.id, 'merchant', req);

    const tokens = await buildTokenPair(merchant.id, 'merchant');

    // Strip password_hash before returning
    const { password_hash, ...safeProfile } = merchant;
    return { merchant: safeProfile, tokens };
  },

  // Update merchant operating hours (replaces all 7 rows)
  updateOperatingHours: async (merchantId, hours) => {
    return await withTransaction(async (client) => {
      await client.query(
        'DELETE FROM merchant_operating_hours WHERE merchant_id = $1',
        [merchantId]
      );
      for (const h of hours) {
        await client.query(
          `INSERT INTO merchant_operating_hours
             (merchant_id, day_of_week, open_time, close_time, is_closed)
           VALUES ($1, $2, $3, $4, $5)`,
          [merchantId, h.day_of_week, h.open_time || null, h.close_time || null, h.is_closed || false]
        );
      }
    });
  },
};

// ═══════════════════════════════════════════════════════════════
// ── ADMIN AUTH SERVICE ────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════

const AdminAuthService = {

  findByEmail: async (email) => {
    const { rows } = await query(
      'SELECT * FROM admins WHERE email = $1 LIMIT 1',
      [email.toLowerCase()]
    );
    return rows[0] || null;
  },

  findById: async (id) => {
    const { rows } = await query(
      `SELECT id, full_name, email, phone, role, permissions,
              allowed_ips, is_2fa_enabled, is_active, last_login_at, created_at
       FROM admins WHERE id = $1 LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  },

  // Step 1: Validate email + password → issue temp token for 2FA
  verifyCredentials: async (email, plainPassword, req) => {
    const admin = await AdminAuthService.findByEmail(email);

    // Constant-time comparison to prevent timing attacks
    const dummyHash = '$2b$12$invalidhashfortimingnormalization000000000000';
    const hash = admin?.password_hash || dummyHash;
    const match = await bcrypt.compare(plainPassword, hash);

    if (!admin || !match) {
      // Log failed attempt
      if (admin) {
        await query(
          `INSERT INTO admin_device_logs (admin_id, ip_address, event, device_info)
           VALUES ($1, $2, 'failed_attempt', $3)`,
          [admin.id, req.ip, JSON.stringify({ userAgent: req.get('User-Agent') })]
        );
      }
      throw Object.assign(new Error('Invalid email or password'), { statusCode: 401 });
    }

    if (!admin.is_active) {
      throw Object.assign(new Error('Admin account is disabled'), { statusCode: 403 });
    }

    // IP restriction check
    if (admin.allowed_ips?.length && process.env.NODE_ENV === 'production') {
      const clientIP = req.ip;
      if (!admin.allowed_ips.includes(clientIP)) {
        logger.warn('Admin login blocked: IP not whitelisted', {
          adminId: admin.id, ip: clientIP
        });
        throw Object.assign(
          new Error('Login not permitted from this IP address'),
          { statusCode: 403 }
        );
      }
    }

    // Generate short-lived temp token (valid 5 min) for 2FA step
    const jwt = require('jsonwebtoken');
    const tempToken = jwt.sign(
      { sub: admin.id, role: 'admin', step: '2fa', email: admin.email },
      process.env.JWT_SECRET,
      { expiresIn: '5m' }
    );

    // Store temp token in Redis to bind it to 2FA step
    await redis.set(`mlb:admin_2fa_pending:${admin.id}`, tempToken, 300); // 5 min

    logger.info('Admin step-1 verified, awaiting 2FA', { adminId: admin.id, ip: req.ip });

    return {
      requires_2fa: admin.is_2fa_enabled,
      temp_token:   tempToken,
      admin_name:   admin.full_name,
      admin_email:  admin.email,
    };
  },

  // Step 2: Verify 2FA OTP → issue real JWT
  verify2FA: async (tempToken, otpCode, req) => {
    const jwt = require('jsonwebtoken');
    let decoded;

    try {
      decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
    } catch {
      throw Object.assign(new Error('2FA session expired. Please login again.'), { statusCode: 401 });
    }

    if (decoded.step !== '2fa') {
      throw Object.assign(new Error('Invalid 2FA token'), { statusCode: 401 });
    }

    // Check pending key still in Redis (prevents token reuse)
    const storedToken = await redis.get(`mlb:admin_2fa_pending:${decoded.sub}`);
    if (!storedToken || storedToken !== tempToken) {
      throw Object.assign(new Error('2FA token already used or expired'), { statusCode: 401 });
    }

    // Verify OTP from Redis
    const { verifyOTP } = require('../utils/otp');
    const otpResult = await verifyOTP(decoded.email, otpCode, 'admin_2fa');
    if (!otpResult.valid) {
      throw Object.assign(new Error(otpResult.reason), { statusCode: 401 });
    }

    // Clean up pending key
    await redis.del(`mlb:admin_2fa_pending:${decoded.sub}`);

    // Fetch fresh admin data
    const admin = await AdminAuthService.findById(decoded.sub);

    // Log successful login
    await query(
      `UPDATE admins SET last_login_at = NOW(), last_login_ip = $1 WHERE id = $2`,
      [req.ip, admin.id]
    );
    await query(
      `INSERT INTO admin_device_logs (admin_id, ip_address, event, device_info)
       VALUES ($1, $2, 'login', $3)`,
      [admin.id, req.ip, JSON.stringify({ userAgent: req.get('User-Agent') })]
    );
    await query(
      `INSERT INTO admin_audit_logs (admin_id, action, ip_address, user_agent)
       VALUES ($1, 'admin_login', $2, $3)`,
      [admin.id, req.ip, req.get('User-Agent')]
    );

    await logSession(admin.id, 'admin', req);
    const tokens = await buildTokenPair(admin.id, 'admin');

    logger.info('Admin logged in successfully', { adminId: admin.id, ip: req.ip });
    return { admin, tokens };
  },

  // Superadmin creates a new admin account
  createAdmin: async (creatorId, data) => {
    const existing = await AdminAuthService.findByEmail(data.email);
    if (existing) {
      throw Object.assign(new Error('Admin with this email already exists'), { statusCode: 409 });
    }

    const passwordHash = await hashPassword(data.password);
    const { rows } = await query(
      `INSERT INTO admins
         (full_name, email, phone, password_hash, role, permissions, allowed_ips, is_2fa_enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true)
       RETURNING id, full_name, email, role, permissions, created_at`,
      [
        data.full_name,
        data.email,
        data.phone      || null,
        passwordHash,
        data.role       || 'admin',
        JSON.stringify(data.permissions || {}),
        data.allowed_ips || null,
      ]
    );

    // Audit log
    await query(
      `INSERT INTO admin_audit_logs (admin_id, action, entity_type, entity_id, new_values)
       VALUES ($1, 'created_admin', 'admins', $2, $3)`,
      [creatorId, rows[0].id, JSON.stringify({ email: data.email, role: data.role })]
    );

    logger.info('New admin created', { by: creatorId, newAdminId: rows[0].id });
    return rows[0];
  },

  // Change admin password
  changePassword: async (adminId, currentPassword, newPassword) => {
    const { rows } = await query(
      'SELECT password_hash FROM admins WHERE id = $1', [adminId]
    );
    if (!rows[0]) throw Object.assign(new Error('Admin not found'), { statusCode: 404 });

    const match = await comparePassword(currentPassword, rows[0].password_hash);
    if (!match) throw Object.assign(new Error('Current password is incorrect'), { statusCode: 401 });

    const newHash = await hashPassword(newPassword);
    await query(
      'UPDATE admins SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [newHash, adminId]
    );

    // Audit
    await query(
      `INSERT INTO admin_audit_logs (admin_id, action) VALUES ($1, 'password_changed')`,
      [adminId]
    );

    logger.info('Admin password changed', { adminId });
  },
};

// ═══════════════════════════════════════════════════════════════
// ── SHARED TOKEN SERVICE ──────────────────────────────────────
// ═══════════════════════════════════════════════════════════════

const TokenService = {

  // Rotate refresh token → new access + refresh token pair
  refresh: async (refreshTokenStr) => {
    let decoded;
    try {
      decoded = verifyRefreshToken(refreshTokenStr);
    } catch {
      throw Object.assign(new Error('Invalid or expired refresh token'), { statusCode: 401 });
    }

    if (decoded.type !== 'refresh') {
      throw Object.assign(new Error('Not a refresh token'), { statusCode: 401 });
    }

    // Verify stored JTI matches (prevents refresh token reuse)
    const storedJti = await redis.get(`mlb:refresh:${decoded.sub}:${decoded.role}`);
    if (!storedJti || storedJti !== decoded.jti) {
      throw Object.assign(new Error('Refresh token has been revoked'), { statusCode: 401 });
    }

    // Issue new token pair (token rotation)
    const tokens = await buildTokenPair(decoded.sub, decoded.role);
    logger.debug('Tokens rotated', { userId: decoded.sub, role: decoded.role });
    return tokens;
  },

  // Logout — revoke access token + delete refresh token
  logout: async (userId, role, jti, accessTokenExpiresAt) => {
    const now      = Math.floor(Date.now() / 1000);
    const ttl      = Math.max(accessTokenExpiresAt - now, 0);

    await Promise.all([
      redis.revokeToken(jti, ttl),                              // blacklist access token
      redis.del(`mlb:refresh:${userId}:${role}`),               // delete refresh token
      query(
        'UPDATE user_sessions SET is_active = false WHERE user_id = $1',
        [userId]
      ),
    ]);

    logger.info('User logged out', { userId, role });
  },
};

module.exports = { CustomerAuthService, MerchantAuthService, AdminAuthService, TokenService };
