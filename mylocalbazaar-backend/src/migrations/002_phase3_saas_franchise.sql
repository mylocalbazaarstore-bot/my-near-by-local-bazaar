-- ============================================================
-- MIGRATION: 002_phase3_saas_franchise.sql
-- MyLocalBazaar.store — Phase 3 Schema Additions
-- Run: node scripts/migrate.js
-- ============================================================

-- ── Franchise Applications Table ─────────────────────────────
CREATE TABLE IF NOT EXISTS franchise_applications (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    applicant_name       VARCHAR(200) NOT NULL,
    email                VARCHAR(255) NOT NULL,
    phone                VARCHAR(15)  NOT NULL,
    territory_city       VARCHAR(100) NOT NULL,
    territory_state      VARCHAR(100) NOT NULL,
    investment_capacity  DECIMAL(12, 2),
    business_experience  TEXT,
    message              TEXT,
    status               VARCHAR(30) NOT NULL DEFAULT 'pending',
    -- Approval fields
    revenue_share_pct    DECIMAL(5, 2),
    contract_months      SMALLINT,
    city_id              UUID REFERENCES cities(id),
    approved_by          UUID REFERENCES admins(id),
    approved_at          TIMESTAMPTZ,
    rejection_reason     TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_franchise_status ON franchise_applications(status);
CREATE INDEX IF NOT EXISTS idx_franchise_city   ON franchise_applications(territory_city);

-- ── Add unique constraint to cities name ─────────────────────
-- (needed for ON CONFLICT in franchise onboarding)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cities_name_key'
  ) THEN
    ALTER TABLE cities ADD CONSTRAINT cities_name_key UNIQUE (name);
  END IF;
END;
$$;

-- ── AI Recommendation Events Table ───────────────────────────
-- Track which recommendations were clicked (for future ML training)
CREATE TABLE IF NOT EXISTS recommendation_events (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id           UUID REFERENCES users(id) ON DELETE CASCADE,
    product_id        UUID REFERENCES products(id) ON DELETE CASCADE,
    event_type        VARCHAR(30) NOT NULL,  -- 'impression' | 'click' | 'purchase'
    recommendation_type VARCHAR(30),         -- 'collaborative' | 'content_based' | 'popular' | 'reorder'
    context           VARCHAR(30),           -- 'home' | 'cart' | 'product' | 'category'
    session_id        VARCHAR(100),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rec_events_user    ON recommendation_events(user_id);
CREATE INDEX IF NOT EXISTS idx_rec_events_product ON recommendation_events(product_id);
CREATE INDEX IF NOT EXISTS idx_rec_events_created ON recommendation_events(created_at);

-- ── CRM Campaigns Table ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_campaigns (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(200) NOT NULL,
    segment         VARCHAR(50),             -- champions | loyal | at_risk | new | inactive | all
    channel         VARCHAR(20) NOT NULL,    -- sms | push | both
    title           VARCHAR(200) NOT NULL,
    body            TEXT NOT NULL,
    coupon_code     VARCHAR(50),
    target_count    INT,
    sent_count      INT DEFAULT 0,
    status          VARCHAR(30) DEFAULT 'draft', -- draft | sent | cancelled
    created_by      UUID REFERENCES admins(id),
    sent_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Feature Gate Audit Logs ───────────────────────────────────
-- Track when merchants hit plan limits (for upsell analytics)
CREATE TABLE IF NOT EXISTS feature_gate_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id     UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    feature         VARCHAR(100) NOT NULL,   -- add_product | ads | analytics | whatsapp
    current_plan    VARCHAR(20) NOT NULL,
    upgrade_to      VARCHAR(20),
    was_blocked     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gate_logs_merchant ON feature_gate_logs(merchant_id);

-- ── Trigger: update updated_at on franchise_applications ─────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_update_franchise_applications'
  ) THEN
    CREATE TRIGGER trg_update_franchise_applications
    BEFORE UPDATE ON franchise_applications
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();
  END IF;
END;
$$;

-- ── Seed: Platform-wide SaaS plan descriptions (CMS) ─────────
INSERT INTO cms_pages (title, slug, content, is_published)
VALUES
  ('Subscription Plans', 'subscription-plans',
   'Compare MyLocalBazaar merchant subscription plans: Free, Basic, Pro, Enterprise.',
   true),
  ('Franchise Program', 'franchise-program',
   'Expand MyLocalBazaar to your city. Apply for a franchise territory today.',
   true)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- END OF MIGRATION 002
-- ============================================================
