// src/config/redis.js
// ─────────────────────────────────────────────────────────────
// Redis Client — MyLocalBazaar.store
// Used for: OTP caching, session blacklist, rate limiting,
//           cart sessions, real-time data caching
// ─────────────────────────────────────────────────────────────

const { createClient } = require('redis');
const logger = require('./logger');

let client = null;
let isConnected = false;

const getClient = async () => {
  if (client && isConnected) return client;

  const redisConfig = process.env.REDIS_URL
    ? { url: process.env.REDIS_URL }
    : {
        socket: {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT) || 6379,
          reconnectStrategy: (retries) => {
            if (retries > 10) {
              logger.error('Redis: max reconnection attempts reached');
              return new Error('Redis max retries exceeded');
            }
            return Math.min(retries * 100, 3000); // backoff
          },
        },
        password: process.env.REDIS_PASSWORD || undefined,
        database: parseInt(process.env.REDIS_DB) || 0,
      };

  client = createClient(redisConfig);

  client.on('connect',        () => { isConnected = true;  logger.info('Redis: connected'); });
  client.on('ready',          () => logger.info('Redis: ready'));
  client.on('error',    (err) => logger.error('Redis error:', { message: err.message }));
  client.on('disconnect',     () => { isConnected = false; logger.warn('Redis: disconnected'); });
  client.on('reconnecting',   () => logger.info('Redis: reconnecting...'));

  await client.connect();
  return client;
};

// ── Namespaced key builders ────────────────────────────────────
const keys = {
  otp:              (phone)   => `mlb:otp:${phone}`,
  otpAttempts:      (phone)   => `mlb:otp_attempts:${phone}`,
  otpCooldown:      (phone)   => `mlb:otp_cooldown:${phone}`,
  session:          (userId)  => `mlb:session:${userId}`,
  revokedToken:     (jti)     => `mlb:revoked:${jti}`,
  cart:             (userId)  => `mlb:cart:${userId}`,
  merchantOnline:   (mId)     => `mlb:merchant_online:${mId}`,
  deliveryLocation: (dId)     => `mlb:dp_location:${dId}`,
  productCache:     (pId)     => `mlb:product:${pId}`,
  categoryCache:    ()        => `mlb:categories`,
  areaCache:        (pincode) => `mlb:area:${pincode}`,
  rateLimitIP:      (ip)      => `mlb:rl:${ip}`,
};

// ── Generic helpers ────────────────────────────────────────────
const redis = {
  get: async (key) => {
    const c = await getClient();
    const val = await c.get(key);
    try { return val ? JSON.parse(val) : null; } catch { return val; }
  },

  set: async (key, value, ttlSeconds = null) => {
    const c = await getClient();
    const serialized = typeof value === 'object' ? JSON.stringify(value) : String(value);
    if (ttlSeconds) return c.set(key, serialized, { EX: ttlSeconds });
    return c.set(key, serialized);
  },

  del: async (key)            => { const c = await getClient(); return c.del(key); },
  exists: async (key)         => { const c = await getClient(); return c.exists(key); },
  ttl: async (key)            => { const c = await getClient(); return c.ttl(key); },
  incr: async (key)           => { const c = await getClient(); return c.incr(key); },
  expire: async (key, ttl)    => { const c = await getClient(); return c.expire(key, ttl); },
  keys: async (pattern)       => { const c = await getClient(); return c.keys(pattern); },

  // ── OTP-specific helpers ──────────────────────────────────────
  setOTP: async (phone, code) => {
    const c = await getClient();
    await c.set(keys.otp(phone), code, { EX: parseInt(process.env.OTP_EXPIRY_MINUTES || 5) * 60 });
  },

  getOTP: async (phone) => {
    const c = await getClient();
    return c.get(keys.otp(phone));
  },

  deleteOTP: async (phone) => {
    const c = await getClient();
    return c.del(keys.otp(phone));
  },

  incrementOTPAttempts: async (phone) => {
    const c = await getClient();
    const key = keys.otpAttempts(phone);
    const attempts = await c.incr(key);
    if (attempts === 1) await c.expire(key, 3600); // 1 hour window
    return attempts;
  },

  // ── Token revocation (JWT blacklist) ──────────────────────────
  revokeToken: async (jti, expiresInSeconds) => {
    const c = await getClient();
    return c.set(keys.revokedToken(jti), '1', { EX: expiresInSeconds });
  },

  isTokenRevoked: async (jti) => {
    const c = await getClient();
    return (await c.exists(keys.revokedToken(jti))) === 1;
  },

  // ── Health check ──────────────────────────────────────────────
  healthCheck: async () => {
    try {
      const c = await getClient();
      await c.ping();
      return { status: 'healthy' };
    } catch (err) {
      return { status: 'unhealthy', error: err.message };
    }
  },

  disconnect: async () => {
    if (client) {
      await client.quit();
      isConnected = false;
      logger.info('Redis: connection closed gracefully');
    }
  },
};

module.exports = { redis, keys, getClient };
