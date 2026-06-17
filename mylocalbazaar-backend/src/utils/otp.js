// src/utils/otp.js
// ─────────────────────────────────────────────────────────────
// OTP Generation & Delivery — MyLocalBazaar.store
// Supports: SMS (Fast2SMS / Twilio) + WhatsApp
// In development: returns fixed code from env (no SMS cost)
// ─────────────────────────────────────────────────────────────

const axios  = require('axios');
const crypto = require('crypto');
const { redis } = require('../config/redis');
const logger = require('../config/logger');

const OTP_EXPIRY   = parseInt(process.env.OTP_EXPIRY_MINUTES  || 5)  * 60;
const MAX_ATTEMPTS = parseInt(process.env.OTP_MAX_ATTEMPTS     || 3);
const COOLDOWN     = parseInt(process.env.OTP_RESEND_COOLDOWN_SECONDS || 60);

const isOtpDevMode = () => (
  process.env.OTP_DEV_MODE === 'true' ||
  process.env.OTP_USE_FIXED_DEV === 'true'
);

// Generate a secure 6-digit OTP
const generateOTP = () => {
  if (isOtpDevMode()) {
    return process.env.OTP_FIXED_DEV_CODE || '123456';
  }
  return String(crypto.randomInt(100000, 999999));
};

// Store OTP in Redis with expiry
const storeOTP = async (phone, otp, purpose = 'login') => {
  const key = `mlb:otp:${phone}:${purpose}`;
  await redis.set(key, otp, OTP_EXPIRY);
};

// Verify OTP — returns { valid, reason }
const verifyOTP = async (phone, inputOtp, purpose = 'login') => {
  const attemptsKey = `mlb:otp_attempts:${phone}:${purpose}`;
  const otpKey      = `mlb:otp:${phone}:${purpose}`;

  const attempts = parseInt(await redis.get(attemptsKey) || '0');
  if (attempts >= MAX_ATTEMPTS) {
    return { valid: false, reason: 'OTP blocked: too many failed attempts. Request a new one.' };
  }

  const storedOtp = await redis.get(otpKey);
  if (!storedOtp) return { valid: false, reason: 'OTP expired or not found' };

  if (String(storedOtp) !== String(inputOtp)) {
    const newAttempts = await redis.incr(attemptsKey);
    if (newAttempts === 1) await redis.expire(attemptsKey, OTP_EXPIRY);
    return { valid: false, reason: `Invalid OTP. ${MAX_ATTEMPTS - newAttempts} attempts remaining` };
  }

  // Valid — clean up
  await redis.del(otpKey);
  await redis.del(attemptsKey);
  return { valid: true };
};

// Check cooldown before allowing resend
const checkCooldown = async (phone, purpose = 'login') => {
  const cooldownKey = `mlb:otp_cooldown:${phone}:${purpose}`;
  const exists = await redis.exists(cooldownKey);
  if (exists) {
    const ttl = await redis.ttl(cooldownKey);
    return { onCooldown: true, secondsLeft: ttl };
  }
  await redis.set(cooldownKey, '1', COOLDOWN);
  return { onCooldown: false };
};

// Send OTP via Fast2SMS (India)
const sendSMSOTP = async (phone, otp) => {
  if (isOtpDevMode()) {
    logger.info(`[DEV] OTP for ${phone}: ${otp}`);
    return { sent: true, provider: 'dev' };
  }

  try {
    const response = await axios.post(
      'https://www.fast2sms.com/dev/bulkV2',
      {
        route: 'q',
        message: `Your OTP is ${otp}. Valid for 5 mins - MyLocalBazaar`,
        numbers: phone,
        flash: 0,
      },
      {
        headers: { authorization: process.env.FAST2SMS_API_KEY },
        timeout: 5000,
      }
    );
    logger.info(`OTP SMS sent to ${phone}`, { provider: 'fast2sms' });
    return { sent: true, provider: 'fast2sms', response: response.data };
  } catch (err) {
    logger.error('Fast2SMS error:', { phone, message: err.message });
    throw new Error('Failed to send OTP SMS');
  }
};

// Send OTP via WhatsApp (Meta Cloud API)
const sendWhatsAppOTP = async (phone, otp) => {
  if (!process.env.WHATSAPP_ACCESS_TOKEN) return { sent: false };

  try {
    await axios.post(
      `${process.env.WHATSAPP_API_URL}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        to: `91${phone}`,
        type: 'template',
        template: {
          name: 'otp_verification',
          language: { code: 'en' },
          components: [{
            type: 'body',
            parameters: [{ type: 'text', text: otp }],
          }],
        },
      },
      {
        headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` },
        timeout: 5000,
      }
    );
    return { sent: true, provider: 'whatsapp' };
  } catch (err) {
    logger.warn('WhatsApp OTP failed, continuing:', { message: err.message });
    return { sent: false };
  }
};

// Full OTP send flow: generate → store → send
const sendOTP = async (phone, purpose = 'login') => {
  const cooldown = await checkCooldown(phone, purpose);
  if (cooldown.onCooldown) {
    throw Object.assign(new Error(`Please wait ${cooldown.secondsLeft}s before requesting a new OTP`), { statusCode: 429 });
  }

  const otp = generateOTP();
  await storeOTP(phone, otp, purpose);

  const [smsResult, whatsAppResult] = await Promise.allSettled([
    sendSMSOTP(phone, otp),
    sendWhatsAppOTP(phone, otp),  // best-effort
  ]);

  if (smsResult.status === 'rejected') {
    logger.warn('OTP stored but SMS delivery failed:', { phone, purpose, message: smsResult.reason.message });
  }

  if (whatsAppResult.status === 'rejected') {
    logger.warn('OTP stored but WhatsApp delivery failed:', { phone, purpose, message: whatsAppResult.reason.message });
  }

  return {
    sent: true,
    delivery: {
      sms: smsResult.status === 'fulfilled' ? smsResult.value : { sent: false },
      whatsapp: whatsAppResult.status === 'fulfilled' ? whatsAppResult.value : { sent: false },
    },
  };
};

module.exports = { generateOTP, storeOTP, verifyOTP, checkCooldown, sendOTP };
