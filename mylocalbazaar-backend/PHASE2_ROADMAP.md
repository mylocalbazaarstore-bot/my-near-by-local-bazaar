# MyLocalBazaar.store — Phase 2 Roadmap
## Catalyst Service Private Limited | Kharghar, Navi Mumbai

---

## Phase 2 Goals Overview

| Goal | Module | Status |
|------|--------|--------|
| 2.1  | Delivery Partner System | 🔜 Starting |
| 2.2  | Firebase Push Notifications + SMS Campaigns | 🔜 Next |
| 2.3  | Reviews, Ratings & Wallet APIs | 🔜 |
| 2.4  | Mobile App API Layer (Customer/Merchant/Delivery) | 🔜 |

---

## Goal 2.1 — Delivery Partner System

### What gets built:
- Delivery Partner Auth (OTP login, JWT, profile)
- Route assignment API (admin assigns orders to partners)
- GPS live location update endpoints
- Delivery OTP verification at doorstep
- Proof of delivery (image upload)
- Earnings & payout dashboard
- Failed delivery report
- Delivery partner mobile APIs

### Files:
- `validators/delivery.validator.js`
- `services/delivery.service.js`
- `controllers/delivery/auth.delivery.controller.js`
- `controllers/delivery/partner.delivery.controller.js`
- `routes/delivery.routes.js`

---

## Goal 2.2 — Notifications System

### What gets built:
- Firebase Admin SDK integration
- Push notification service (FCM)
- In-app notification CRUD APIs
- SMS campaign service (Fast2SMS bulk)
- Email template engine (Nodemailer)
- WhatsApp business message templates
- Notification preferences management

### Files:
- `config/firebase.js`
- `services/push.service.js`
- `services/sms.service.js`
- `controllers/notifications/notification.controller.js`
- `routes/notification.routes.js`

---

## Goal 2.3 — Reviews, Wallet & Coupons APIs

### What gets built:
- Product / Merchant / Service reviews
- Review moderation (admin flag)
- Customer wallet top-up flow
- Coupon listing for customer
- Referral reward processing

---

## Goal 2.4 — Mobile App API Layer

### What gets built:
- Versioned mobile API responses
- Customer App API docs
- Merchant App API docs  
- Delivery App API docs
- API rate limits for mobile clients
- JWT refresh optimized for mobile
- Offline-safe endpoints

---

## Phase 2 Architecture Notes

All Phase 2 services build ON TOP of Phase 1 — no breaking changes.
New routes are ADDITIVE only.

Route namespaces:
- `/api/v1/delivery/*`     → Delivery partner system
- `/api/v1/notifications/*` → Notification management
- `/api/v1/reviews/*`      → Review system
- `/api/v1/wallet/*`       → Wallet operations
- `/api/v1/coupons/*`      → Customer coupon listing
- `/api/v1/mobile/*`       → Mobile-optimised endpoints
