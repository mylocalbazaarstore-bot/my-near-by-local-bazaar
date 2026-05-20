# MyLocalBazaar.store — Auth API Documentation
## Phase 1 · Goal 1.3 · Version 1.0.0

**Base URL:** `https://api.mylocalbazaar.store/api/v1`
**Auth Header:** `Authorization: Bearer <access_token>`

---

## 🟢 CUSTOMER AUTH

### 1. Request OTP
```
POST /auth/customer/send-otp
Rate Limit: 5 requests/hour per phone
```
**Request Body:**
```json
{ "phone": "9876543210", "purpose": "login" }
```
**purpose values:** `login` | `register` | `reset`

**Response `200`:**
```json
{ "success": true, "message": "OTP sent to 98765XXXXX", "data": { "sent": true } }
```

---

### 2. Verify OTP → Login / Register
```
POST /auth/customer/verify-otp
Rate Limit: 10 requests/15min per IP
```
**Request:**
```json
{ "phone": "9876543210", "otp": "123456", "purpose": "login" }
```
**Response `200`:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": "uuid",
      "full_name": "MLB User",
      "phone": "9876543210",
      "email": null,
      "referral_code": "MLB1A2B",
      "wallet_balance": 0.00,
      "is_new_user": false
    },
    "tokens": {
      "access_token": "eyJ...",
      "refresh_token": "eyJ...",
      "token_type": "Bearer"
    }
  }
}
```
> ⚠️ If `is_new_user: true`, prompt customer to call `/complete-profile` next.

---

### 3. Complete Profile (New Users)
```
POST /auth/customer/complete-profile
Auth: Required (customer)
```
**Request:**
```json
{
  "full_name": "Rahul Sharma",
  "email": "rahul@example.com",
  "gender": "male",
  "date_of_birth": "1995-06-15",
  "referral_code": "ABC123"
}
```

---

### 4. Get Own Profile
```
GET /auth/customer/me
Auth: Required (customer)
```

---

### 5. Add Delivery Address
```
POST /auth/customer/address
Auth: Required (customer)
```
**Request:**
```json
{
  "label": "Home",
  "full_name": "Rahul Sharma",
  "phone": "9876543210",
  "address_line1": "Flat 201, Sector 12",
  "landmark": "Near D-Mart",
  "pincode": "410210",
  "city": "Navi Mumbai",
  "state": "Maharashtra",
  "is_default": true
}
```

---

### 6. Get Addresses
```
GET /auth/customer/addresses
Auth: Required (customer)
```

---

### 7. Update Address
```
PUT /auth/customer/address/:id
Auth: Required (customer)
```

---

### 8. Delete Address
```
DELETE /auth/customer/address/:id
Auth: Required (customer)
```

---

### 9. Refresh Tokens
```
POST /auth/customer/refresh
```
**Request:** `{ "refresh_token": "eyJ..." }`
**Response:** New `access_token` + `refresh_token` pair

---

### 10. Logout
```
POST /auth/customer/logout
Auth: Required
```

---

## 🟡 MERCHANT AUTH

### 1. Request OTP
```
POST /auth/merchant/send-otp
Rate Limit: 5/hour per phone
```
```json
{ "phone": "9898989898", "purpose": "register" }
```

---

### 2. Verify OTP (Registration)
```
POST /auth/merchant/verify-otp
```
```json
{ "phone": "9898989898", "otp": "123456", "purpose": "register" }
```
**Response (register purpose):**
```json
{
  "data": {
    "phone_verified_token": "eyJ...",
    "message": "Phone verified. Complete your registration."
  }
}
```
> ✅ `phone_verified_token` expires in **15 minutes** and is single-use.

---

### 3. Full Registration
```
POST /auth/merchant/register
Rate Limit: 10/15min per IP
```
**Request:**
```json
{
  "phone_verified_token": "eyJ...",
  "owner_name": "Rajesh Patil",
  "email": "rajesh@store.com",
  "password": "SecurePass@123",
  "confirm_password": "SecurePass@123",
  "store_name": "Patil Grocery",
  "store_category": "grocery_fmcg",
  "store_description": "Fresh vegetables and groceries in Kharghar",
  "address_line1": "Shop 5, Sector 12 Market",
  "pincode": "410210",
  "min_order_value": 100,
  "delivery_radius_km": 3,
  "accepts_cod": true,
  "gstin": "27AABCP1234A1Z5",
  "pan_number": "AABCP1234A"
}
```
**Response `201`:**
```json
{
  "data": {
    "merchant": {
      "id": "uuid",
      "store_name": "Patil Grocery",
      "store_slug": "patil-grocery",
      "kyc_status": "pending",
      "merchant_status": "pending"
    },
    "message": "Your store application is under review. We will notify you within 1–2 business days."
  }
}
```

---

### 4. Password Login
```
POST /auth/merchant/login
```
```json
{ "phone": "9898989898", "password": "SecurePass@123" }
```
**Response includes** `merchant` profile + `tokens` + `alerts[]` (e.g. KYC reminders).

---

### 5. Get Store Profile
```
GET /auth/merchant/me
Auth: Required (merchant)
```
Returns full store profile including `operating_hours[]`.

---

### 6. Set Operating Hours
```
PUT /auth/merchant/hours
Auth: Required (merchant)
```
```json
{
  "hours": [
    { "day_of_week": 0, "is_closed": true },
    { "day_of_week": 1, "open_time": "09:00", "close_time": "21:00", "is_closed": false },
    { "day_of_week": 2, "open_time": "09:00", "close_time": "21:00", "is_closed": false },
    { "day_of_week": 3, "open_time": "09:00", "close_time": "21:00", "is_closed": false },
    { "day_of_week": 4, "open_time": "09:00", "close_time": "21:00", "is_closed": false },
    { "day_of_week": 5, "open_time": "09:00", "close_time": "22:00", "is_closed": false },
    { "day_of_week": 6, "open_time": "10:00", "close_time": "20:00", "is_closed": false }
  ]
}
```
> `day_of_week`: 0=Sunday, 1=Monday ... 6=Saturday

---

### 7. Submit KYC Documents
```
POST /auth/merchant/kyc
Auth: Required (merchant)
Content-Type: multipart/form-data
```
**Form fields:**
| Field | Type | Description |
|-------|------|-------------|
| `gst_certificate` | File | GST Certificate (JPG/PNG/PDF, max 10MB) |
| `pan_card` | File | PAN Card scan |
| `aadhaar_front` | File | Aadhaar front |
| `aadhaar_back` | File | Aadhaar back |
| `shop_license` | File | Shop & Establishment license |
| `food_license` | File | FSSAI license (food merchants only) |
| `gstin` | String | 15-char GST number |
| `pan_number` | String | 10-char PAN |

---

### 8. KYC Status
```
GET /auth/merchant/kyc/status
Auth: Required (merchant)
```

---

### 9. Toggle Store Open/Closed
```
PATCH /auth/merchant/toggle-open
Auth: Required (merchant)
```
Instantly toggles `is_open` field on the store.

---

### 10. Refresh / Logout
```
POST /auth/merchant/refresh   → { refresh_token }
POST /auth/merchant/logout    → Auth required
```

---

## 🔴 ADMIN AUTH (2-Step 2FA)

> 🔒 All admin routes are IP-restricted in production.
> Only IPs in `ADMIN_ALLOWED_IPS` env var can access these endpoints.

### Step 1: Email + Password Login
```
POST /auth/admin/login
Rate Limit: 30/15min per IP (admin-specific limiter)
```
```json
{ "email": "admin@mylocalbazaar.store", "password": "AdminPass@123" }
```
**Response `200`:**
```json
{
  "data": {
    "temp_token": "eyJ...",
    "requires_2fa": true,
    "admin_name": "Catalyst Admin",
    "message": "OTP sent to your registered email. Enter it within 5 minutes."
  }
}
```

---

### Step 2: Verify 2FA OTP
```
POST /auth/admin/verify-2fa
```
```json
{ "temp_token": "eyJ...", "otp": "847291" }
```
**Response `200`:**
```json
{
  "data": {
    "admin": {
      "id": "uuid",
      "full_name": "Catalyst Admin",
      "email": "admin@mylocalbazaar.store",
      "role": "superadmin",
      "permissions": {}
    },
    "tokens": {
      "access_token": "eyJ...",
      "refresh_token": "eyJ...",
      "token_type": "Bearer"
    }
  },
  "message": "Welcome back, Catalyst Admin!"
}
```

---

### Create Admin (Superadmin Only)
```
POST /auth/admin/create
Auth: Required (superadmin role)
```
```json
{
  "full_name": "Support Admin",
  "email": "support@mylocalbazaar.store",
  "password": "Support@123",
  "confirm_password": "Support@123",
  "role": "admin",
  "permissions": {
    "manage_merchants": true,
    "manage_orders": true,
    "view_analytics": true
  },
  "allowed_ips": ["122.161.100.200"]
}
```

---

### Other Admin Endpoints
```
GET  /auth/admin/me               → Own profile
PUT  /auth/admin/change-password  → Change password
GET  /auth/admin/sessions         → Active sessions
GET  /auth/admin/audit-logs?page=1&limit=20
POST /auth/admin/logout
POST /auth/admin/refresh          → { refresh_token }
```

---

## ❌ Error Response Format

All errors follow this standard format:
```json
{
  "success": false,
  "message": "Human-readable error description",
  "code": "ERROR_CODE",
  "errors": [
    { "field": "phone", "message": "Phone must be a valid 10-digit Indian mobile number" }
  ]
}
```

**Common error codes:**
| Code | HTTP | Meaning |
|------|------|---------|
| `VALIDATION_ERROR` | 422 | Joi validation failed — `errors[]` array populated |
| `UNAUTHORIZED` | 401 | Missing or invalid token |
| `TOKEN_EXPIRED` | 401 | JWT expired — use refresh token |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `DUPLICATE_ENTRY` | 409 | Phone/email already registered |
| `NOT_FOUND` | 404 | Resource does not exist |
| `FORBIDDEN` | 403 | Insufficient role / IP blocked |

---

## 🔄 Token Lifecycle

```
Access Token:   7 days  (configurable via JWT_EXPIRES_IN)
Refresh Token: 30 days  (configurable via JWT_REFRESH_EXPIRES_IN)
Temp Token:     5 min   (admin 2FA intermediate step)
Phone Token:   15 min   (merchant registration phone verify)
OTP:            5 min   (configurable via OTP_EXPIRY_MINUTES)
```

**Token rotation:** Every `/refresh` call invalidates the old refresh token and issues a new pair (prevents refresh token reuse attacks).

**Logout:** Access token is immediately blacklisted in Redis. Refresh token is deleted from Redis.
