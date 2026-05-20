# MyLocalBazaar.store — Phase 3 Roadmap
## SaaS Expansion | Franchise | AI | Multi-City Scale
## Catalyst Service Private Limited | Kharghar, Navi Mumbai

---

## Phase 3 Goals

| Goal | Module | Deliverable |
|------|--------|-------------|
| 3.1 | Merchant SaaS Subscription System | Plan enforcement, billing, feature gates |
| 3.2 | Franchise & White-Label System | Multi-city expansion, franchisee onboarding |
| 3.3 | AI Product Recommendations | ML-based engine, collaborative filtering |
| 3.4 | Advanced CRM & Analytics | Segmentation, re-engagement, cohort analysis |
| 3.5 | Multi-City Scaling Engine | City onboarding, area expansion automation |

---

## Goal 3.1 — Merchant SaaS Subscriptions

### Plans:
| Plan | Price/Month | Features |
|------|-------------|----------|
| Free | ₹0 | 10 products, basic dashboard |
| Basic | ₹499 | 100 products, analytics, WhatsApp |
| Pro | ₹999 | Unlimited products, sponsored ads, priority support |
| Enterprise | ₹2499 | White-label, API access, dedicated manager |

### Files:
- `validators/saas.validator.js`
- `services/saas.service.js`
- `controllers/saas/subscription.controller.js`
- `routes/saas.routes.js`

---

## Goal 3.2 — Franchise System

### What gets built:
- Franchise application flow
- Franchisee onboarding + territory assignment
- Revenue sharing model (franchisee gets X% of city GMV)
- White-label configuration per city
- Franchise dashboard

### Files:
- `services/franchise.service.js`
- `controllers/franchise/franchise.controller.js`
- `routes/franchise.routes.js`

---

## Goal 3.3 — AI Recommendations

### Algorithm:
- Collaborative filtering (users who bought X also bought Y)
- Content-based filtering (product category + tags)
- Hyperlocal boost (nearby merchant products get priority)
- Purchase history personalization
- "Frequently reordered" detection

### Files:
- `services/ai/recommendation.service.js`
- `controllers/ai/recommendation.controller.js`
- `routes/ai.routes.js`

---

## Goal 3.4 — Advanced CRM & Analytics

### What gets built:
- Customer segmentation (RFM: Recency, Frequency, Monetary)
- Re-engagement campaign automation
- Cohort analysis API
- Merchant performance scoring
- Platform health dashboard

---

## Goal 3.5 — Multi-City Scaling Engine

### What gets built:
- New city onboarding API
- Area expansion request + approval
- City-specific merchant discovery
- Cross-city analytics
- Geographic growth heatmap
