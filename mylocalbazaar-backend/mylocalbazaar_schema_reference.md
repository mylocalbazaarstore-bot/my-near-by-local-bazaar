# MYLOCALBAZAAR.STORE — Database Schema Reference
## Phase 1 · Goal 1.1 · Version 1.0.0

---

## 📦 Schema Summary

| Section | Tables | Purpose |
|---|---|---|
| 1 | ENUMs (14) | Type safety across all tables |
| 2 | cities, areas | Pincode & PostGIS hyperlocal zones |
| 3 | users, user_addresses | Customer accounts & saved addresses |
| 4 | otp_logs, user_sessions | Auth, OTP, JWT session tracking |
| 5 | merchants, merchant_kyc, merchant_bank_details, merchant_operating_hours, merchant_subscriptions | Full merchant SaaS profile |
| 6 | categories, subcategories | 13 core marketplace categories |
| 7 | products, product_images, product_variants | Product catalog with full-text search |
| 8 | service_providers, services, service_slots, bookings | Appointment booking system |
| 9 | carts, cart_items, wishlists | Single-merchant cart restriction enforced |
| 10 | orders, order_items, order_status_logs, return_requests | **Double-Approval Logic** |
| 11 | payments | Razorpay / UPI / Wallet gateway |
| 12 | wallets, wallet_transactions | Customer & Merchant wallets |
| 13 | delivery_partners, delivery_assignments | Delivery OTP & Proof system |
| 14 | reviews | Verified purchase reviews |
| 15 | admins, admin_audit_logs, admin_device_logs | Secure admin with IP restriction |
| 16 | coupons, coupon_usage, banners, referrals | Marketing & promotions |
| 17 | notifications | Push / SMS / WhatsApp triggers |
| 18 | complaint_tickets, ticket_replies | Customer support |
| 19 | cms_pages | Static page CMS |
| 20 | loyalty_programs, user_loyalty_points, sponsored_ads | Merchant SaaS features |
| 21 | merchant_settlements | Razorpay payout settlements |
| 22 | VIEW: merchant_area_availability | Area-based delivery zone check |

---

## 🔄 Double-Approval Order Flow

```
Customer Places Order
        │
        ▼
[payment_pending]  ──► Payment Gateway (Razorpay)
        │
        ▼
[payment_processed]  ◄── Payment Captured (Webhook)
        │
        ▼
Merchant Notified (WhatsApp + Push)
        │
   ┌────┴─────┐
   ▼           ▼
[merchant_  [merchant_
 approved]   rejected]
   │               │
   │           Admin can override
   │               │
   │         [admin_overridden]
   │               │
   └──────┬────────┘
          ▼
      [accepted]
          │
      [packed]
          │
   [out_for_delivery]
          │
      [delivered]  ◄── Delivery OTP verified + Proof uploaded
```

---

## 📍 Area-Based Availability Logic

The `merchant_area_availability` VIEW uses PostGIS `ST_Distance()` to
calculate real-world distance between a merchant's `geom` point and a
customer's area `geom` point.

```sql
-- Example: Find all merchants available in Kharghar Sector 12
SELECT store_name, store_category, distance_km, is_within_zone
FROM merchant_area_availability
WHERE pincode = '410210'
  AND is_within_zone = TRUE
ORDER BY distance_km;
```

---

## 🗂 Folder Structure (Next Steps)

```
mylocalbazaar/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   └── db.js           ← PostgreSQL pool config
│   │   ├── models/             ← One file per table
│   │   ├── routes/
│   │   ├── controllers/
│   │   └── middlewares/
│   ├── migrations/
│   │   └── 001_initial_schema.sql  ← THIS FILE
│   └── .env.example
├── frontend/                   ← Phase 1 Goal 1.2
└── admin/                      ← Phase 1 Goal 1.3
```

---

## ⚙️ Required PostgreSQL Extensions

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";   -- UUID generation
CREATE EXTENSION IF NOT EXISTS "pg_trgm";     -- Fuzzy search
CREATE EXTENSION IF NOT EXISTS "unaccent";    -- Hindi/Marathi name search
CREATE EXTENSION IF NOT EXISTS "postgis";     -- Geolocation & radius queries
```

> ⚠️ PostGIS must be installed on your PostgreSQL server.
> On Railway: use `railway run psql` and run extensions as superuser.
> On Supabase: PostGIS is pre-enabled.

---

## 🔐 Security Notes

- Passwords use bcrypt (cost factor 12) — never stored plain
- Admin table has `allowed_ips INET[]` for IP whitelisting
- All sensitive actions logged in `admin_audit_logs`
- OTPs expire in 5 minutes (enforced at app layer)
- `user_sessions` stores hashed JWT — revoke by deleting row
- Payment signatures verified server-side via Razorpay HMAC

---

## 📌 Phase 1 Roadmap

| Goal | Task | Status |
|---|---|---|
| 1.1 | Database Schema Design | ✅ Done |
| 1.2 | Backend Setup (Node.js + Express + PostgreSQL) | 🔜 Next |
| 1.3 | Auth System (OTP Login + JWT + 2FA) | 🔜 |
| 1.4 | Merchant Onboarding APIs | 🔜 |
| 1.5 | Homepage Frontend (Next.js) | 🔜 |
| 1.6 | Customer Dashboard | 🔜 |
| 1.7 | Merchant Dashboard | 🔜 |
| 1.8 | Admin Panel Core | 🔜 |
