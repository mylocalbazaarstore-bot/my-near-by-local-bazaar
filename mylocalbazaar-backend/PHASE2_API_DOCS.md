# MyLocalBazaar.store — Phase 2 API Documentation
## Mobile App API Reference | Version 2.0.0

**Base URL:** `https://api.mylocalbazaar.store/api/v1`
**Auth:** `Authorization: Bearer <access_token>`

---

## 🚚 GOAL 2.1 — DELIVERY PARTNER SYSTEM

### Auth Flow

```
POST /delivery/auth/send-otp     { phone, purpose: "register" }
POST /delivery/auth/verify-otp   { phone, otp, purpose: "register" }
  → Returns: { phone_verified_token }
POST /delivery/auth/register     { phone_verified_token, full_name, password, vehicle_type, ... }
POST /delivery/auth/login        { phone, password }
  → Returns: { partner, tokens }
GET  /delivery/auth/me           → Partner profile
POST /delivery/auth/logout
POST /delivery/auth/refresh      { refresh_token }
```

### Partner Operations

| Method | Endpoint | Description |
|--------|----------|-------------|
| `PATCH` | `/delivery/location` | **GPS update** — called every 30s from mobile |
| `PATCH` | `/delivery/status` | `{ is_online: true/false }` — toggle availability |
| `GET` | `/delivery/assignments/active` | All in-progress deliveries |
| `GET` | `/delivery/assignments` | Delivery history (paginated, filterable) |
| `POST` | `/delivery/assignments/:id/pickup` | Confirm pickup from merchant |
| `POST` | `/delivery/assignments/:id/otp` | `{ otp: "1234" }` — verify customer OTP |
| `POST` | `/delivery/assignments/:id/proof` | Upload proof image (multipart/form-data) |
| `POST` | `/delivery/assignments/:id/failed` | `{ reason, notes }` — report failure |
| `GET` | `/delivery/earnings?period=week` | Earnings dashboard |
| `POST` | `/delivery/earnings/payout` | `{ amount: 500 }` — request payout |

### Admin Delivery Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/delivery/admin/assign` | `{ partner_id, order_id }` — assign delivery |
| `GET` | `/delivery/admin/available?lat=&lng=&radius_km=5` | Nearest online partners |
| `GET` | `/delivery/admin/partners` | All partners list |
| `PATCH` | `/delivery/admin/partners/:id/verify` | Verify/un-verify partner |
| `GET` | `/delivery/admin/partners/:id/location` | Live GPS location |

### Delivery Lifecycle

```
Admin assigns order
  ↓
Partner gets FCM push: "New Delivery Assigned!"
  ↓
POST /delivery/assignments/:id/pickup  (partner at merchant)
  ↓  delivery_status → 'in_transit'
Partner navigates to customer using delivery_address from response
  ↓
POST /delivery/assignments/:id/otp  { otp: "4829" }
  ↓  OTP matches → order_status → 'delivered'
     Partner earnings credited automatically
  ↓
POST /delivery/assignments/:id/proof  (optional photo upload)
```

---

## 🔔 GOAL 2.2 — NOTIFICATIONS & SMS CAMPAIGNS

### Customer/Merchant/Partner Notification Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/notifications` | List notifications (paginated) |
| `GET` | `/notifications/unread-count` | Badge count for app icon |
| `PATCH` | `/notifications/:id/read` | Mark one read |
| `PATCH` | `/notifications/read-all` | Clear all |
| `DELETE` | `/notifications/:id` | Delete |
| `POST` | `/notifications/register-token` | Register FCM device token |

#### Register FCM Token (call on every app launch)
```json
POST /notifications/register-token
{ "fcm_token": "fcm_...", "device_type": "android", "device_id": "uuid" }
```

### Admin Campaign Endpoints

#### Send Campaign (SMS + Push to segment)
```json
POST /notifications/admin/campaign
{
  "title":        "🎉 Weekend Sale!",
  "body":         "Get 20% off on all grocery orders this weekend.",
  "channel":      "both",
  "target_role":  "customer",
  "target_area_id": "uuid",
  "coupon_code":  "WEEKEND20"
}
```
**Response:**
```json
{
  "campaign": {
    "total_targets": 1250,
    "sms":  { "sent": true, "totalSent": 1238 },
    "push": { "sent": true, "successCount": 1100 }
  }
}
```

#### Broadcast to All Users of a Role
```json
POST /notifications/admin/broadcast
{ "title": "New merchants in your area!", "body": "...", "role": "customer" }
```

#### Test Push to a Device
```json
POST /notifications/admin/test-push
{ "fcm_token": "your_token_here" }
```

### FCM Notification Payloads

All push notifications include a `data` object for app navigation:

| Event | `data.screen` | Additional data |
|-------|--------------|----------------|
| Order placed | `order_detail` | `order_id` |
| Order approved | `order_detail` | `order_id` |
| Out for delivery | `order_detail` | `order_id`, `otp` |
| Delivery assigned (partner) | `delivery_active` | `order_id` |
| Low stock (merchant) | `merchant_products` | `product_id` |
| Wallet credited | `wallet` | — |
| New offer | `store_detail` | `merchant_id` |

---

## ⭐ GOAL 2.3 — REVIEWS, WALLET & COUPONS

### Reviews

```
POST /reviews                  → Submit review (verified purchase auto-detected)
GET  /reviews/product/:id      → Product reviews + rating breakdown
GET  /reviews/merchant/:id     → Merchant reviews
GET  /reviews/my               → Own reviews
DELETE /reviews/:id            → Remove own review
```

#### Submit Review
```json
POST /reviews
{
  "product_id":  "uuid",
  "merchant_id": "uuid",
  "order_id":    "uuid",
  "rating":      5,
  "title":       "Fresh and fast!",
  "body":        "Got my vegetables in 20 minutes. Great quality!"
}
```

### Customer Wallet

```
GET  /wallet              → Balance + 5 recent transactions
GET  /wallet/transactions → Full history (paginated)
POST /wallet/topup        → { amount: 500 } → Razorpay order for top-up
```

#### Wallet Top-Up Flow
```
POST /wallet/topup { amount: 200 }
  → Returns: { razorpay_order_id, amount, key_id }
  → Frontend loads Razorpay SDK with razorpay_order_id
  → After payment: POST /orders/verify { razorpay_payment_id, ... }
  → Webhook: payment.captured → wallet balance credited
```

### Coupons

```
GET  /coupons                 → Active coupons visible to this user
GET  /coupons?merchant_id=x   → Coupons for specific merchant
POST /coupons/validate        → { code, merchant_id, subtotal } → Preview discount
```

---

## 📱 GOAL 2.4 — MOBILE APP API LAYER

### Aggregated Single-Request Endpoints

These endpoints bundle multiple queries into one response to reduce mobile network round trips.

#### Customer App Home Screen
```
GET /mobile/customer/home
```
**Returns in one call:**
```json
{
  "categories":    [...8 categories],
  "merchants":     [...12 featured merchants],
  "active_orders": 2,
  "wallet_balance": 150.00,
  "unread_notifications": 3,
  "area":          { "name": "Kharghar Sec 12", "pincode": "410210" }
}
```

#### Customer Cart Summary (tab bar badge)
```
GET /mobile/customer/cart-summary
→ { item_count: 3, subtotal: 450.00, store_name: "Patil Grocery" }
```

#### Set Customer Location
```
POST /mobile/customer/set-location
{ "area_id": "uuid" }  OR  { "pincode": "410210" }
```

#### Merchant App Home Dashboard
```
GET /mobile/merchant/dashboard
```
```json
{
  "pending_approvals": 2,
  "today": { "delivered_today": 8, "revenue_today": 4200, "orders_today": 11 },
  "low_stock_count": 3,
  "store": { "is_open": true, "rating": 4.7, "kyc_status": "verified" }
}
```

#### Quick Store Toggle
```
PATCH /mobile/merchant/toggle-open
→ { "is_open": true }
```

#### Delivery Partner Dashboard
```
GET /mobile/delivery/dashboard
```
```json
{
  "active_assignments": [{ "order_number": "MLB-ORD-...", "delivery_status": "in_transit", ... }],
  "today": { "delivered_today": 5, "earnings_today": 225.00 },
  "profile": { "is_online": true, "wallet_balance": 1250.50, "rating": 4.8 }
}
```

#### Batch GPS Upload (offline mode recovery)
```json
POST /mobile/delivery/location-batch
{
  "points": [
    { "lat": 19.047, "lng": 73.069, "timestamp": "2026-05-19T10:00:00Z" },
    { "lat": 19.048, "lng": 73.070, "timestamp": "2026-05-19T10:00:30Z" }
  ]
}
```

#### App Configuration (check on launch)
```
GET /mobile/app-config
```
```json
{
  "min_app_version": { "customer": "1.0.0", "merchant": "1.0.0", "delivery": "1.0.0" },
  "features": { "wallet_topup": true, "cod": true, "live_tracking": true },
  "free_delivery_above": 500,
  "support": { "phone": "+91-99999-99999" }
}
```

#### In-App Feedback
```json
POST /mobile/feedback
{
  "type":        "bug",
  "message":     "Cart clears unexpectedly on back navigation",
  "app_version": "1.0.3",
  "device_info": { "os": "Android 13", "model": "Redmi Note 12" }
}
```

---

## 🔐 Authentication Reference

| Role | Login Endpoint | Token Role Claim |
|------|---------------|-----------------|
| Customer | `POST /auth/customer/verify-otp` | `customer` |
| Merchant | `POST /auth/merchant/login` | `merchant` |
| Admin | `POST /auth/admin/verify-2fa` | `admin` |
| Delivery Partner | `POST /delivery/auth/login` | `delivery_partner` |

All tokens expire in **7 days** (access) / **30 days** (refresh).
Use `POST /<role>/auth/refresh { refresh_token }` to rotate.

---

## 📊 Phase 2 Stats

| Module | Endpoints Added |
|--------|----------------|
| Delivery Partner System | 16 |
| Notifications + Campaigns | 9 |
| Reviews | 5 |
| Wallet | 3 |
| Coupons | 2 |
| Mobile Aggregated APIs | 9 |
| **Phase 2 Total** | **44** |
| **Phase 1 Total** | **120+** |
| **Grand Total** | **164+** |
