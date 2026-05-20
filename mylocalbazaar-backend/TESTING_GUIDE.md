# MyLocalBazaar.store — Complete Testing Guide
## Catalyst Service Private Limited | v3.0.0

---

## 🚀 BEFORE YOU START

### Prerequisites checklist:
```bash
# 1. PostgreSQL running
pg_isready                    # Should say: accepting connections

# 2. Redis running
redis-cli ping                # Should return: PONG

# 3. Backend running
cd backend && npm run dev
# Should show: Server running on port 5000

# 4. Frontend running (separate terminal)
cd frontend && npm run dev
# Should show: Ready on http://localhost:3000

# 5. Confirm health
curl http://localhost:5000/api/v1/health
# Expected: { "version": "3.0.0", "services": { "database": {...}, "redis": {...} } }
```

---

## 📥 POSTMAN SETUP

### Import the collection:
1. Open Postman → **Import** button (top-left)
2. Select `MyLocalBazaar_Postman_Collection.json`
3. Collection appears in left sidebar

### Set environment variables:
Go to **Collection → Variables** tab:
| Variable | Value |
|----------|-------|
| `BASE_URL` | `http://localhost:5000/api/v1` |
| `CUSTOMER_PHONE` | `9999999999` (any 10-digit number) |
| `MERCHANT_PHONE` | `8888888888` (your test merchant's phone) |

> **Note:** `CUSTOMER_TOKEN`, `MERCHANT_TOKEN` etc. are auto-filled by the collection's test scripts when you run the auth requests.

---

## 📋 PHASE-BY-PHASE TEST CHECKLIST

### ═══ HEALTH CHECK ════════════════════════════════

- [ ] `GET /health` → `version: "3.0.0"` + database: healthy + redis: healthy

---

### ═══ PHASE 1 — AUTH ══════════════════════════════

#### Customer Auth Flow:
- [ ] `POST /auth/customer/send-otp` → `{ sent: true }`
- [ ] `POST /auth/customer/verify-otp` with `otp: "123456"` (dev OTP) → token received, auto-saved to `CUSTOMER_TOKEN`
- [ ] `GET /auth/customer/me` with token → user profile returned

#### Merchant Auth Flow:
- [ ] `POST /auth/merchant/login` → token received, saved to `MERCHANT_TOKEN`
- [ ] Verify merchant profile data is correct

#### Admin Auth Flow:
- [ ] `POST /auth/admin/login` with email+password → `{ otp_sent: true }`
- [ ] `POST /auth/admin/verify-2fa` with OTP → `ADMIN_TOKEN` received

---

### ═══ PHASE 1 — PRODUCTS & CATALOGUE ═════════════

- [ ] `GET /categories` → 13 categories returned
- [ ] `GET /areas/search?q=Kharghar` → area results with lat/lng
- [ ] `GET /areas/pincode/410210` → Kharghar area data
- [ ] `GET /merchants/by-pincode/410210` → local merchants list
- [ ] `GET /merchant/products` (merchant auth) → paginated product list
- [ ] `POST /merchant/products` → product created with `pending_approval` status
- [ ] `GET /merchant/dashboard/overview?period=month` → analytics data

---

### ═══ PHASE 1 — CART & DOUBLE-APPROVAL FLOW ══════

**This is the most critical test. Follow this sequence:**

- [ ] **Step 1:** `GET /cart` → empty cart or existing items
- [ ] **Step 2:** `POST /cart/items` with `TEST_PRODUCT_ID` → `cart_item.id` saved
- [ ] **Step 3:** `PUT /cart/items/:id` → quantity updated
- [ ] **Step 4:** `POST /orders` with `payment_method: "cod"` → order ID saved
  - ✅ Order status should be: `payment_processed`
  - ✅ Merchant should receive notification
- [ ] **Step 5 (Switch to Merchant):** `GET /merchant/orders/pending` → order appears
- [ ] **Step 6 (Merchant Approves):** `POST /merchant/orders/:id/action` `{ action: "approve" }`
  - ✅ Status → `merchant_approved`
  - ✅ Customer receives notification
- [ ] **Step 7:** `PATCH /merchant/orders/:id/status` `{ status: "packed" }`
  - ✅ Status → `packed`
- [ ] **Step 8:** `GET /orders/:id` (customer) → timeline shows all 3 steps chronologically

---

### ═══ PHASE 1 — ADMIN PANEL ══════════════════════

- [ ] `GET /admin/analytics/overview?period=month` → GMV + orders + users + merchants KPIs
- [ ] `GET /admin/analytics/fraud-signals` → merchants with >30% rejection rate listed
- [ ] `GET /admin/merchants?status=pending` → pending merchant approvals
- [ ] `POST /admin/marketing/coupons` → coupon created
- [ ] `GET /admin/analytics/geographic` → heatmap data with lat/lng per area

---

### ═══ PHASE 2 — DELIVERY SYSTEM ═════════════════

- [ ] `POST /delivery/auth/login` → delivery token received
- [ ] `PATCH /delivery/location` with lat/lng → `{ updated: true }`
  - Verify: check Redis key `mlb:dp_location:{partnerId}`
- [ ] `PATCH /delivery/status` `{ is_online: true }` → `{ is_online: true }`
- [ ] `GET /delivery/assignments/active` → active orders array
- [ ] `GET /delivery/admin/available?lat=19.04&lng=73.06` → nearby online partners
- [ ] `GET /delivery/earnings?period=week` → earnings breakdown

---

### ═══ PHASE 2 — NOTIFICATIONS ═══════════════════

- [ ] `GET /notifications` → notification list
- [ ] `GET /notifications/unread-count` → `{ count: N }`
- [ ] `PATCH /notifications/read-all` → all marked read
- [ ] `POST /notifications/register-token` → FCM token saved
- [ ] `POST /notifications/admin/campaign` → campaign dispatched

---

### ═══ PHASE 2 — REVIEWS, WALLET, COUPONS ════════

- [ ] `GET /wallet` → balance + recent transactions
- [ ] `GET /coupons` → active coupons (filtered by user's exhausted codes)
- [ ] `POST /reviews` → review submitted, merchant rating updated
- [ ] `GET /reviews/product/:id` → reviews with rating breakdown

---

### ═══ PHASE 2 — MOBILE APIS ═════════════════════

- [ ] `GET /mobile/customer/home` → ONE call returns categories + merchants + wallet + orders count + unread notifs
- [ ] `GET /mobile/merchant/dashboard` → ONE call returns pending + today stats + low stock
- [ ] `GET /mobile/delivery/dashboard` → ONE call returns active + earnings + profile
- [ ] `GET /mobile/app-config` → feature flags, min version, support info
- [ ] `PATCH /mobile/merchant/toggle-open` → store status flipped

---

### ═══ PHASE 3 — SAAS SUBSCRIPTIONS ══════════════

- [ ] `GET /saas/plans` → 4 plans: free, basic, pro, enterprise with pricing
- [ ] `GET /saas/my-plan` (merchant) → current plan + limits + usage + days_remaining
- [ ] `GET /saas/feature-check/add_product` → `{ allowed: true/false }` with reason if blocked
- [ ] `GET /saas/feature-check/analytics` → plan gate check
- [ ] `GET /saas/admin/revenue` → MRR + ARR + per-plan breakdown
- [ ] `POST /saas/admin/grant` → plan granted to merchant

---

### ═══ PHASE 3 — AI RECOMMENDATIONS ══════════════

- [ ] `GET /ai/recommendations?context=home` → personalised + has `sections.reorder`, `sections.for_you`
- [ ] `GET /ai/recommendations/trending?pincode=410210` → trending products in area
- [ ] `GET /ai/recommendations/similar/:productId` → similar products by category + tags
- [ ] After delivery: `POST /ai/recommendations/invalidate` → cache cleared

---

### ═══ PHASE 3 — FRANCHISE & CRM ════════════════

- [ ] `POST /franchise/apply` → application submitted with ID
- [ ] `GET /franchise/territories` → active territories map
- [ ] `GET /admin/crm/health` → complete platform GMV + user + merchant stats
- [ ] `GET /admin/crm/summary` → RFM segments: champions, loyal, at_risk, new, inactive counts
- [ ] `GET /admin/crm/cohort` → 6-month retention cohort grid
- [ ] `GET /cities` → active cities list
- [ ] `POST /cities` (admin) → new city onboarded

---

### ═══ SECURITY TESTS ══════════════════════════════

- [ ] `GET /admin/merchants` **without token** → `401 Unauthorized`
- [ ] `GET /merchant/orders/pending` **with CUSTOMER token** → `403 Forbidden`
- [ ] `POST /auth/customer/verify-otp` with wrong OTP `000000` → `400 Bad Request`
- [ ] `POST /orders` with empty body → `422 Unprocessable Entity`
- [ ] Rate limiting: Call same endpoint 50+ times rapidly → `429 Too Many Requests`

---

## 🖥️ FRONTEND TEST CHECKLIST

### Homepage (`http://localhost:3000`):
- [ ] Logo, header, location pill visible
- [ ] Hero section with search bar
- [ ] Type pincode `410210` → area dropdown appears
- [ ] Select area → merchants load
- [ ] All 13 category cards with correct colours
- [ ] Festival banner in category grid
- [ ] Featured merchants horizontal scroll works
- [ ] Footer with all 5 legal links
- [ ] Mobile responsive (resize window)

### Customer Login (`/login`):
- [ ] Phone input with +91 prefix
- [ ] Valid phone → OTP button activates
- [ ] Send OTP → toast "OTP sent to 99999XXXXX"
- [ ] 6 OTP boxes appear, tab/focus moves automatically
- [ ] Paste OTP → all boxes fill
- [ ] Wrong OTP → error message, boxes reset
- [ ] Correct OTP → redirect to `/dashboard`
- [ ] 60-second resend countdown works

### Customer Dashboard (`/dashboard`):
- [ ] Auth guard: visiting without login → redirect to `/login`
- [ ] Sidebar navigation works on desktop
- [ ] Mobile: hamburger opens drawer
- [ ] Overview KPI cards load with real data
- [ ] Orders tab: order list with status badges
- [ ] Click order → slide-over opens with items + timeline
- [ ] Wishlist tab: product grid (empty or with items)
- [ ] Wallet tab: balance card + transaction history
- [ ] Notification bell shows unread count badge
- [ ] Logout button → redirects to homepage

### Merchant Login (`/merchant/login`):
- [ ] Phone + password form
- [ ] Wrong credentials → red error alert
- [ ] Correct login → redirect to `/merchant-dashboard`

### Merchant Dashboard (`/merchant-dashboard`):
- [ ] Auth guard: non-merchant → redirect to `/merchant/login`
- [ ] KPI cards: Revenue, Orders, Products, Customers
- [ ] Revenue area chart renders (Recharts)
- [ ] Order status donut chart renders
- [ ] Pending orders widget: approve/reject buttons work
  - Click Approve → success toast + order disappears from pending
  - Click Reject → reason textarea appears → confirm
- [ ] Products table: all products listed with status badges
- [ ] Inline stock edit: click number → input appears → save
- [ ] Add Product form slide-over opens/closes
- [ ] Store toggle: open/close switches
- [ ] KYC panel shows document checklist
- [ ] Period selector (Today/Week/Month) updates charts

### Set Location (`/set-location`):
- [ ] Search input focused on load
- [ ] Type "Kharghar" → dropdown with areas
- [ ] Type "410210" → pincode area appears
- [ ] Click area → saved to localStorage + redirect
- [ ] Quick-select grid of Navi Mumbai areas

---

## 🐛 COMMON ERRORS & FIXES

### Backend Issues:

**`Cannot find module '../config/db'`**
```bash
# Wrong: You're in src/routes/
# Fix: Check require paths — should be '../../config/db' from controllers
```

**`relation "delivery_partners" does not exist`**
```bash
# Phase 2 tables not migrated yet
node scripts/migrate.js
```

**`relation "franchise_applications" does not exist`**
```bash
# Phase 3 migration needed
psql -U mlb_user -d mylocalbazaar_db -f migrations/002_phase3_saas_franchise.sql
```

**`Redis connection refused`**
```bash
redis-server                    # Start Redis
# or
sudo service redis-server start # Linux
```

**`JWT_SECRET is not defined`**
```bash
# Check .env file exists and has:
JWT_SECRET=your_super_secret_key_min_32_chars
```

**`Rate limit: Too Many Requests (429)`**
```bash
# Wait 15 minutes OR restart backend for testing
# Or in .env: RATE_LIMIT_WINDOW_MS=1000 RATE_LIMIT_MAX=1000
```

### Frontend Issues:

**`NEXT_PUBLIC_API_URL not set`**
```bash
# frontend/.env.local must have:
NEXT_PUBLIC_API_URL=http://localhost:5000/api/v1
```

**`Hydration mismatch error`**
```bash
# Providers.tsx wraps children with AuthHydrationGuard
# This is already fixed — just restart: npm run dev
```

**`Cannot read properties of null (reading 'rows')`**
```bash
# API returned null data — check backend is running
# Run health check first
```

**`Recharts not rendering charts`**
```bash
npm install recharts
# Already in package.json — just run: npm install
```

---

## 📊 TEST RUN SUMMARY TEMPLATE

After testing, fill in:

```
Test Date: _______________
Tester:    _______________

Phase 1 Tests: ___/45 passed
Phase 2 Tests: ___/30 passed
Phase 3 Tests: ___/25 passed
Security Tests: ___/5 passed
Frontend Tests: ___/40 passed

Total: ___/145

Issues found:
1. _______________
2. _______________
3. _______________

Status: [ ] Ready for deployment  [ ] Needs fixes
```

---

## 🚀 DEPLOYMENT READINESS

When all tests pass:

```bash
# Backend production build
NODE_ENV=production pm2 start ecosystem.config.js

# Frontend production build
cd frontend
npm run build
npm run start

# Or deploy to Vercel (frontend)
vercel --prod

# Deploy to Railway (backend)
railway up
```

---

*MyLocalBazaar.store | Catalyst Service Private Limited*
*Kharghar, Navi Mumbai | Built with ❤️ in India 🇮🇳*
