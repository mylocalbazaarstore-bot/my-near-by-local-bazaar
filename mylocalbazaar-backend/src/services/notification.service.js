// src/services/notification.service.js
// ─────────────────────────────────────────────────────────────
// Notification Service — MyLocalBazaar.store
// Handles: Email (Nodemailer) | SMS (Fast2SMS) | WhatsApp
// Called after auth events: welcome, KYC status, approval, etc.
// ─────────────────────────────────────────────────────────────

const nodemailer = require('nodemailer');
const axios      = require('axios');
const logger     = require('../config/logger');

// ── Email Transporter ──────────────────────────────────────────
const transporter = nodemailer.createTransport({
  host:   process.env.EMAIL_HOST   || 'smtp.gmail.com',
  port:   parseInt(process.env.EMAIL_PORT) || 587,
  secure: process.env.EMAIL_SECURE === 'true',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
  pool:             true,
  maxConnections:   5,
  rateDelta:        1000,
  rateLimit:        5,
});

// ── Base email template ────────────────────────────────────────
const emailTemplate = (title, content) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 40px auto; background: #fff;
                 border-radius: 12px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #22c55e, #f97316);
              padding: 32px 24px; text-align: center; }
    .header h1 { color: #fff; margin: 0; font-size: 24px; }
    .header p  { color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 14px; }
    .body { padding: 32px 24px; }
    .body h2 { color: #1f2937; font-size: 20px; margin-top: 0; }
    .body p  { color: #4b5563; line-height: 1.6; }
    .badge { display: inline-block; padding: 6px 16px; border-radius: 999px;
             font-size: 13px; font-weight: 600; margin: 4px 0; }
    .badge-success { background: #dcfce7; color: #16a34a; }
    .badge-warning { background: #fef9c3; color: #ca8a04; }
    .badge-danger  { background: #fee2e2; color: #dc2626; }
    .cta { display: inline-block; margin: 20px 0; padding: 14px 28px;
           background: #22c55e; color: #fff; text-decoration: none;
           border-radius: 8px; font-weight: 600; font-size: 15px; }
    .footer { background: #f9fafb; padding: 20px 24px; text-align: center;
              font-size: 12px; color: #9ca3af; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🛒 MyLocalBazaar</h1>
      <p>Your Local Market, Digitally Connected</p>
    </div>
    <div class="body">
      <h2>${title}</h2>
      ${content}
    </div>
    <div class="footer">
      <p>© 2026 Catalyst Service Private Limited · Kharghar, Navi Mumbai</p>
      <p>
        <a href="${process.env.FRONTEND_URL}/privacy">Privacy</a> ·
        <a href="${process.env.FRONTEND_URL}/terms">Terms</a> ·
        <a href="${process.env.FRONTEND_URL}/contact">Support</a>
      </p>
    </div>
  </div>
</body>
</html>
`;

// ── Send email helper ──────────────────────────────────────────
const sendEmail = async ({ to, subject, html, text }) => {
  if (!process.env.EMAIL_USER) {
    logger.warn('Email not configured — skipping email send', { to, subject });
    return { sent: false, reason: 'EMAIL_NOT_CONFIGURED' };
  }
  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || '"MyLocalBazaar" <noreply@mylocalbazaar.store>',
      to, subject, html, text,
    });
    logger.info('Email sent', { to, subject, messageId: info.messageId });
    return { sent: true, messageId: info.messageId };
  } catch (err) {
    logger.error('Email send failed:', { to, subject, message: err.message });
    return { sent: false, error: err.message };
  }
};

// ── WhatsApp message helper ────────────────────────────────────
const sendWhatsApp = async (phone, templateName, params = []) => {
  if (!process.env.WHATSAPP_ACCESS_TOKEN) return { sent: false };
  try {
    await axios.post(
      `${process.env.WHATSAPP_API_URL}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        to: `91${phone}`,
        type: 'template',
        template: {
          name:     templateName,
          language: { code: 'en' },
          components: params.length ? [{
            type: 'body',
            parameters: params.map((p) => ({ type: 'text', text: String(p) })),
          }] : [],
        },
      },
      { headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` }, timeout: 5000 }
    );
    return { sent: true };
  } catch (err) {
    logger.warn('WhatsApp send failed:', { phone, template: templateName, error: err.message });
    return { sent: false };
  }
};

// ═══════════════════════════════════════════════════════════════
// SPECIFIC NOTIFICATION EVENTS
// ═══════════════════════════════════════════════════════════════

const NotificationService = {

  // Sent to new customers after first login
  sendCustomerWelcome: async ({ email, phone, name, referralCode }) => {
    const html = emailTemplate(
      `Welcome to MyLocalBazaar, ${name}! 🎉`,
      `<p>Hello <strong>${name}</strong>,</p>
       <p>You're now part of Kharghar's digital marketplace. Shop local, book local, grow local!</p>
       <p>Your referral code: <span class="badge badge-success">${referralCode}</span></p>
       <p>Share it with friends and earn wallet rewards.</p>
       <a href="${process.env.FRONTEND_URL}" class="cta">Start Shopping →</a>`
    );

    await Promise.allSettled([
      email ? sendEmail({ to: email, subject: 'Welcome to MyLocalBazaar! 🛒', html }) : Promise.resolve(),
      sendWhatsApp(phone, 'customer_welcome', [name, referralCode]),
    ]);
  },

  // Merchant registration received
  sendMerchantRegistrationAck: async ({ email, phone, ownerName, storeName }) => {
    const html = emailTemplate(
      `Registration Received — ${storeName}`,
      `<p>Dear <strong>${ownerName}</strong>,</p>
       <p>We have received your registration for <strong>${storeName}</strong>.</p>
       <p>Our team will verify your details within <strong>1–2 business days</strong>.</p>
       <p>Status: <span class="badge badge-warning">Under Review</span></p>
       <p>You can track your application status by logging into your merchant dashboard.</p>
       <a href="${process.env.FRONTEND_URL}/merchant/dashboard" class="cta">Go to Dashboard →</a>
       <p style="margin-top:24px; font-size:13px; color:#6b7280;">
         Questions? Email us at <a href="mailto:merchants@mylocalbazaar.store">merchants@mylocalbazaar.store</a>
       </p>`
    );

    await Promise.allSettled([
      email ? sendEmail({ to: email, subject: `Registration received — ${storeName}`, html }) : Promise.resolve(),
      sendWhatsApp(phone, 'merchant_registration_ack', [ownerName, storeName]),
    ]);
  },

  // Merchant account approved by admin
  sendMerchantApproved: async ({ email, phone, ownerName, storeName, storeSlug }) => {
    const storeUrl = `${process.env.FRONTEND_URL}/store/${storeSlug}`;
    const html = emailTemplate(
      `🎉 Congratulations! ${storeName} is now LIVE`,
      `<p>Dear <strong>${ownerName}</strong>,</p>
       <p>Your store <strong>${storeName}</strong> has been approved and is now live on MyLocalBazaar!</p>
       <p>Status: <span class="badge badge-success">Approved & Live</span></p>
       <p>Your store URL: <a href="${storeUrl}">${storeUrl}</a></p>
       <a href="${process.env.FRONTEND_URL}/merchant/dashboard" class="cta">Go to Merchant Dashboard →</a>`
    );

    await Promise.allSettled([
      email ? sendEmail({ to: email, subject: `Your store ${storeName} is now LIVE! 🚀`, html }) : Promise.resolve(),
      sendWhatsApp(phone, 'merchant_approved', [ownerName, storeName]),
    ]);
  },

  // Merchant account rejected
  sendMerchantRejected: async ({ email, phone, ownerName, storeName, reason }) => {
    const html = emailTemplate(
      `Application Update — ${storeName}`,
      `<p>Dear <strong>${ownerName}</strong>,</p>
       <p>We regret to inform you that your store application for <strong>${storeName}</strong>
          could not be approved at this time.</p>
       <p><strong>Reason:</strong> ${reason || 'Does not meet our current listing criteria.'}</p>
       <p>Status: <span class="badge badge-danger">Rejected</span></p>
       <p>You may reapply after addressing the above. Contact us if you need help.</p>
       <a href="mailto:support@mylocalbazaar.store" class="cta">Contact Support</a>`
    );

    await Promise.allSettled([
      email ? sendEmail({ to: email, subject: `Store application update — ${storeName}`, html }) : Promise.resolve(),
      sendWhatsApp(phone, 'merchant_rejected', [ownerName]),
    ]);
  },

  // Admin 2FA OTP email
  sendAdmin2FAOTP: async ({ email, adminName, otp }) => {
    const html = emailTemplate(
      'Admin Login — 2FA Verification',
      `<p>Hello <strong>${adminName}</strong>,</p>
       <p>Your One-Time Password for admin login:</p>
       <div style="text-align:center; margin: 24px 0;">
         <span style="font-size:40px; font-weight:800; letter-spacing:8px;
                      color:#1e3a8a; background:#eff6ff; padding:16px 32px;
                      border-radius:12px; border:2px dashed #93c5fd;">
           ${otp}
         </span>
       </div>
       <p>This OTP expires in <strong>5 minutes</strong>. Do not share it with anyone.</p>
       <p style="color:#dc2626; font-size:13px;">
         ⚠️ If you did not attempt to log in, please secure your account immediately.
       </p>`
    );

    await sendEmail({
      to: email,
      subject: `[MyLocalBazaar Admin] Your 2FA OTP: ${otp}`,
      html,
    });
  },
};

module.exports = { NotificationService, sendEmail, sendWhatsApp };
