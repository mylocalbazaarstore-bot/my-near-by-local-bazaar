-- ============================================================
-- MYLOCALBAZAAR.STORE — COMPLETE POSTGRESQL DATABASE SCHEMA
-- Parent Company: Catalyst Service Private Limited
-- Version: 1.0.0
-- ============================================================

-- Required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- PostGIS is optional; geolocation features degrade gracefully without it
DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS "postgis";
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'PostGIS not available (%). Geolocation features will be limited.', SQLERRM;
END;
$$;

-- ============================================================
-- SECTION 1: ENUMS
-- ============================================================

CREATE TYPE user_role AS ENUM ('customer', 'merchant', 'delivery_partner', 'admin', 'superadmin');
CREATE TYPE kyc_status AS ENUM ('pending', 'submitted', 'verified', 'rejected');
CREATE TYPE merchant_status AS ENUM ('pending', 'active', 'suspended', 'disabled', 'rejected');
CREATE TYPE product_status AS ENUM ('draft', 'pending_approval', 'active', 'rejected', 'out_of_stock', 'archived');
CREATE TYPE order_status AS ENUM (
    'payment_pending', 'payment_processed', 'merchant_approved', 'merchant_rejected',
    'admin_overridden', 'accepted', 'packed', 'out_for_delivery', 'delivered',
    'cancelled', 'return_requested', 'return_approved', 'return_rejected',
    'refund_initiated', 'refund_completed'
);
CREATE TYPE booking_status AS ENUM ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show');
CREATE TYPE payment_status AS ENUM ('pending', 'captured', 'failed', 'refunded', 'partially_refunded');
CREATE TYPE payment_method AS ENUM ('razorpay', 'upi', 'wallet', 'cod', 'stripe');
CREATE TYPE delivery_status AS ENUM ('assigned', 'picked_up', 'in_transit', 'delivered', 'failed', 'returned');
CREATE TYPE notification_type AS ENUM ('order', 'booking', 'payment', 'promotion', 'system', 'alert');
CREATE TYPE service_category AS ENUM (
    'doctor', 'mens_salon', 'womens_salon',
    'plumber', 'electrician', 'carpenter', 'ac_repair', 'home_services'
);
CREATE TYPE store_category AS ENUM (
    'grocery_fmcg', 'wholesale', 'electronics', 'hardware',
    'clothing', 'medical', 'food_tea_stall', 'food_chaat_chinese',
    'specialty', 'service'
);
CREATE TYPE transaction_type AS ENUM ('credit', 'debit');
CREATE TYPE coupon_type AS ENUM ('percentage', 'flat', 'free_delivery');
CREATE TYPE subscription_plan AS ENUM ('free', 'basic', 'pro', 'enterprise');
CREATE TYPE gender AS ENUM ('male', 'female', 'other', 'prefer_not_to_say');


-- ============================================================
-- SECTION 2: LOCATION TABLES
-- ============================================================

CREATE TABLE cities (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name       VARCHAR(100) NOT NULL,
    state      VARCHAR(100) NOT NULL DEFAULT 'Maharashtra',
    country    VARCHAR(100) NOT NULL DEFAULT 'India',
    is_active  BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- areas: geom column added conditionally below if PostGIS is available
CREATE TABLE areas (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    city_id    UUID NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
    name       VARCHAR(150) NOT NULL,
    pincode    VARCHAR(10) NOT NULL,
    latitude   DECIMAL(10, 8),
    longitude  DECIMAL(11, 8),
    is_active  BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_areas_pincode ON areas(pincode);
CREATE INDEX idx_areas_city_id ON areas(city_id);

-- Add PostGIS geography columns if extension is available
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN
        EXECUTE 'ALTER TABLE areas ADD COLUMN IF NOT EXISTS geom geography(POINT, 4326)';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_areas_geom ON areas USING GIST(geom)';
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Could not add PostGIS column to areas: %', SQLERRM;
END;
$$;


-- ============================================================
-- SECTION 3: USERS
-- ============================================================

CREATE TABLE users (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name         VARCHAR(200) NOT NULL,
    email             VARCHAR(255) UNIQUE,
    phone             VARCHAR(15) UNIQUE NOT NULL,
    password_hash     TEXT,
    gender            gender,
    date_of_birth     DATE,
    profile_image_url TEXT,
    referral_code     VARCHAR(20) UNIQUE,
    referred_by       UUID REFERENCES users(id),
    wallet_balance    DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    is_email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    is_phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
    is_active         BOOLEAN NOT NULL DEFAULT TRUE,
    is_blocked        BOOLEAN NOT NULL DEFAULT FALSE,
    last_login_at     TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_email ON users(email);

CREATE TABLE user_addresses (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label         VARCHAR(50) DEFAULT 'Home',
    full_name     VARCHAR(200),
    phone         VARCHAR(15),
    address_line1 TEXT NOT NULL,
    address_line2 TEXT,
    landmark      TEXT,
    area_id       UUID REFERENCES areas(id),
    pincode       VARCHAR(10) NOT NULL,
    city          VARCHAR(100) NOT NULL DEFAULT 'Navi Mumbai',
    state         VARCHAR(100) NOT NULL DEFAULT 'Maharashtra',
    latitude      DECIMAL(10, 8),
    longitude     DECIMAL(11, 8),
    is_default    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_addresses_user ON user_addresses(user_id);


-- ============================================================
-- SECTION 4: OTP & SESSION MANAGEMENT
-- ============================================================

CREATE TABLE otp_logs (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone      VARCHAR(15),
    email      VARCHAR(255),
    otp_code   VARCHAR(10) NOT NULL,
    purpose    VARCHAR(50) NOT NULL,
    is_used    BOOLEAN NOT NULL DEFAULT FALSE,
    attempts   SMALLINT NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_otp_phone   ON otp_logs(phone);
CREATE INDEX idx_otp_expires ON otp_logs(expires_at);

CREATE TABLE user_sessions (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL,
    user_role   user_role NOT NULL,
    token_hash  TEXT NOT NULL UNIQUE,
    device_info JSONB,
    ip_address  INET,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sessions_user_id ON user_sessions(user_id);


-- ============================================================
-- SECTION 5: MERCHANTS
-- ============================================================

CREATE TABLE merchants (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_name              VARCHAR(200) NOT NULL,
    email                   VARCHAR(255) UNIQUE,
    phone                   VARCHAR(15) UNIQUE NOT NULL,
    password_hash           TEXT NOT NULL,
    store_name              VARCHAR(300) NOT NULL,
    store_slug              VARCHAR(300) UNIQUE NOT NULL,
    store_category          store_category NOT NULL,
    store_logo_url          TEXT,
    store_banner_url        TEXT,
    store_description       TEXT,
    gstin                   VARCHAR(20),
    pan_number              VARCHAR(12),
    udyog_aadhaar           VARCHAR(20),
    address_line1           TEXT,
    address_line2           TEXT,
    landmark                TEXT,
    area_id                 UUID REFERENCES areas(id),
    pincode                 VARCHAR(10),
    latitude                DECIMAL(10, 8),
    longitude               DECIMAL(11, 8),
    delivery_radius_km      DECIMAL(5, 2) DEFAULT 5.00,
    min_order_value         DECIMAL(10, 2) DEFAULT 0.00,
    is_open                 BOOLEAN NOT NULL DEFAULT TRUE,
    emergency_booking       BOOLEAN NOT NULL DEFAULT FALSE,
    accepts_cod             BOOLEAN NOT NULL DEFAULT TRUE,
    whatsapp_catalog_link   TEXT,
    kyc_status              kyc_status NOT NULL DEFAULT 'pending',
    merchant_status         merchant_status NOT NULL DEFAULT 'pending',
    subscription_plan       subscription_plan NOT NULL DEFAULT 'free',
    subscription_expires_at TIMESTAMPTZ,
    rating                  DECIMAL(3, 2) DEFAULT 0.00,
    total_reviews           INT NOT NULL DEFAULT 0,
    is_featured             BOOLEAN NOT NULL DEFAULT FALSE,
    is_active               BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at           TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_merchants_slug     ON merchants(store_slug);
CREATE INDEX idx_merchants_area     ON merchants(area_id);
CREATE INDEX idx_merchants_pincode  ON merchants(pincode);
CREATE INDEX idx_merchants_category ON merchants(store_category);
CREATE INDEX idx_merchants_status   ON merchants(merchant_status, kyc_status);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN
        EXECUTE 'ALTER TABLE merchants ADD COLUMN IF NOT EXISTS geom geography(POINT, 4326)';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_merchants_geom ON merchants USING GIST(geom)';
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Could not add PostGIS column to merchants: %', SQLERRM;
END;
$$;

CREATE TABLE merchant_kyc (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id          UUID NOT NULL UNIQUE REFERENCES merchants(id) ON DELETE CASCADE,
    gst_certificate_url  TEXT,
    pan_card_url         TEXT,
    aadhaar_front_url    TEXT,
    aadhaar_back_url     TEXT,
    udyog_aadhaar_url    TEXT,
    shop_license_url     TEXT,
    food_license_url     TEXT,
    verified_by          UUID,
    verified_at          TIMESTAMPTZ,
    rejection_reason     TEXT,
    submitted_at         TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE merchant_bank_details (
    id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id               UUID NOT NULL UNIQUE REFERENCES merchants(id) ON DELETE CASCADE,
    account_holder_name       VARCHAR(200) NOT NULL,
    account_number            VARCHAR(30) NOT NULL,
    ifsc_code                 VARCHAR(15) NOT NULL,
    bank_name                 VARCHAR(100),
    branch_name               VARCHAR(100),
    upi_id                    VARCHAR(100),
    razorpay_contact_id       TEXT,
    razorpay_fund_account_id  TEXT,
    is_verified               BOOLEAN NOT NULL DEFAULT FALSE,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE merchant_operating_hours (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    open_time   TIME,
    close_time  TIME,
    is_closed   BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE UNIQUE INDEX idx_merchant_hours_unique ON merchant_operating_hours(merchant_id, day_of_week);

CREATE TABLE merchant_subscriptions (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    plan        subscription_plan NOT NULL,
    price       DECIMAL(10, 2) NOT NULL,
    started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at  TIMESTAMPTZ NOT NULL,
    payment_id  UUID,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- SECTION 6: CATEGORIES
-- ============================================================

CREATE TABLE categories (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name           VARCHAR(150) NOT NULL,
    slug           VARCHAR(150) UNIQUE NOT NULL,
    description    TEXT,
    image_url      TEXT,
    icon_url       TEXT,
    theme_color    VARCHAR(20),
    store_category store_category,
    sort_order     SMALLINT DEFAULT 0,
    is_active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE subcategories (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    name        VARCHAR(150) NOT NULL,
    slug        VARCHAR(150) UNIQUE NOT NULL,
    description TEXT,
    image_url   TEXT,
    sort_order  SMALLINT DEFAULT 0,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subcats_category ON subcategories(category_id);


-- ============================================================
-- SECTION 7: PRODUCTS
-- ============================================================

CREATE TABLE products (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id       UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    category_id       UUID REFERENCES categories(id),
    subcategory_id    UUID REFERENCES subcategories(id),
    name              VARCHAR(300) NOT NULL,
    slug              VARCHAR(300) NOT NULL,
    description       TEXT,
    short_description VARCHAR(500),
    sku               VARCHAR(100),
    barcode           VARCHAR(100),
    brand             VARCHAR(100),
    unit              VARCHAR(50),
    mrp               DECIMAL(12, 2) NOT NULL,
    retail_price      DECIMAL(12, 2) NOT NULL,
    wholesale_price   DECIMAL(12, 2),
    moq               INT DEFAULT 1,
    stock_quantity    INT NOT NULL DEFAULT 0,
    low_stock_threshold INT DEFAULT 5,
    track_inventory   BOOLEAN NOT NULL DEFAULT TRUE,
    gst_percentage    DECIMAL(5, 2) DEFAULT 0.00,
    hsn_code          VARCHAR(20),
    weight_grams      INT,
    tags              TEXT[],
    search_vector     TSVECTOR,
    is_featured       BOOLEAN NOT NULL DEFAULT FALSE,
    is_sponsored      BOOLEAN NOT NULL DEFAULT FALSE,
    is_returnable     BOOLEAN NOT NULL DEFAULT TRUE,
    return_window_days SMALLINT DEFAULT 7,
    product_status    product_status NOT NULL DEFAULT 'pending_approval',
    approved_by       UUID,
    approved_at       TIMESTAMPTZ,
    rejection_reason  TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_products_merchant_slug ON products(merchant_id, slug);
CREATE INDEX idx_products_merchant  ON products(merchant_id);
CREATE INDEX idx_products_category  ON products(category_id);
CREATE INDEX idx_products_status    ON products(product_status);
CREATE INDEX idx_products_search    ON products USING GIN(search_vector);
CREATE INDEX idx_products_tags      ON products USING GIN(tags);

CREATE OR REPLACE FUNCTION update_product_search_vector()
RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector := to_tsvector('english',
        COALESCE(NEW.name, '') || ' ' ||
        COALESCE(NEW.brand, '') || ' ' ||
        COALESCE(NEW.description, '') || ' ' ||
        COALESCE(array_to_string(NEW.tags, ' '), '')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_product_search
BEFORE INSERT OR UPDATE ON products
FOR EACH ROW EXECUTE FUNCTION update_product_search_vector();

CREATE TABLE product_images (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    image_url  TEXT NOT NULL,
    alt_text   VARCHAR(255),
    sort_order SMALLINT DEFAULT 0,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_product_images_product ON product_images(product_id);

CREATE TABLE product_variants (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    variant_name    VARCHAR(100) NOT NULL,
    variant_type    VARCHAR(50) NOT NULL,
    mrp             DECIMAL(12, 2) NOT NULL,
    retail_price    DECIMAL(12, 2) NOT NULL,
    wholesale_price DECIMAL(12, 2),
    stock_quantity  INT NOT NULL DEFAULT 0,
    sku             VARCHAR(100),
    image_url       TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_variants_product ON product_variants(product_id);


-- ============================================================
-- SECTION 8: SERVICES & BOOKINGS
-- ============================================================

CREATE TABLE service_providers (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id       UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    service_category  service_category NOT NULL,
    staff_name        VARCHAR(200),
    specialization    VARCHAR(300),
    experience_years  SMALLINT,
    qualification     TEXT,
    profile_image_url TEXT,
    is_available      BOOLEAN NOT NULL DEFAULT TRUE,
    rating            DECIMAL(3, 2) DEFAULT 0.00,
    total_reviews     INT NOT NULL DEFAULT 0,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_providers_merchant ON service_providers(merchant_id);
CREATE INDEX idx_providers_category ON service_providers(service_category);

CREATE TABLE services (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id      UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    provider_id      UUID REFERENCES service_providers(id),
    category_id      UUID REFERENCES categories(id),
    name             VARCHAR(300) NOT NULL,
    description      TEXT,
    duration_minutes SMALLINT NOT NULL DEFAULT 30,
    price            DECIMAL(10, 2) NOT NULL,
    discount_price   DECIMAL(10, 2),
    image_url        TEXT,
    is_home_visit    BOOLEAN NOT NULL DEFAULT FALSE,
    is_active        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE service_slots (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES service_providers(id) ON DELETE CASCADE,
    slot_date   DATE NOT NULL,
    start_time  TIME NOT NULL,
    end_time    TIME NOT NULL,
    is_booked   BOOLEAN NOT NULL DEFAULT FALSE,
    is_blocked  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_slots_provider_date ON service_slots(provider_id, slot_date);

CREATE TABLE bookings (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_number      VARCHAR(30) UNIQUE NOT NULL,
    user_id             UUID NOT NULL REFERENCES users(id),
    merchant_id         UUID NOT NULL REFERENCES merchants(id),
    service_id          UUID NOT NULL REFERENCES services(id),
    provider_id         UUID REFERENCES service_providers(id),
    slot_id             UUID REFERENCES service_slots(id),
    booking_date        DATE NOT NULL,
    booking_time        TIME NOT NULL,
    address_id          UUID REFERENCES user_addresses(id),
    notes               TEXT,
    service_price       DECIMAL(10, 2) NOT NULL,
    discount_amount     DECIMAL(10, 2) DEFAULT 0.00,
    final_price         DECIMAL(10, 2) NOT NULL,
    payment_status      payment_status NOT NULL DEFAULT 'pending',
    booking_status      booking_status NOT NULL DEFAULT 'pending',
    cancellation_reason TEXT,
    is_emergency        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bookings_user     ON bookings(user_id);
CREATE INDEX idx_bookings_merchant ON bookings(merchant_id);
CREATE INDEX idx_bookings_date     ON bookings(booking_date);


-- ============================================================
-- SECTION 9: CART & WISHLIST
-- ============================================================

CREATE TABLE carts (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    merchant_id UUID REFERENCES merchants(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE cart_items (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cart_id    UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id),
    variant_id UUID REFERENCES product_variants(id),
    quantity   INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price DECIMAL(12, 2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(cart_id, product_id, variant_id)
);

CREATE INDEX idx_cart_items_cart ON cart_items(cart_id);

CREATE TABLE wishlists (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, product_id)
);

CREATE INDEX idx_wishlists_user ON wishlists(user_id);


-- ============================================================
-- SECTION 10: ORDERS — DOUBLE APPROVAL LOGIC
-- ============================================================

CREATE TABLE orders (
    id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_number             VARCHAR(30) UNIQUE NOT NULL,
    user_id                  UUID NOT NULL REFERENCES users(id),
    merchant_id              UUID NOT NULL REFERENCES merchants(id),
    delivery_address         JSONB NOT NULL,
    subtotal                 DECIMAL(12, 2) NOT NULL,
    discount_amount          DECIMAL(12, 2) DEFAULT 0.00,
    coupon_code              VARCHAR(50),
    delivery_charge          DECIMAL(10, 2) DEFAULT 0.00,
    gst_amount               DECIMAL(10, 2) DEFAULT 0.00,
    total_amount             DECIMAL(12, 2) NOT NULL,
    payment_method           payment_method NOT NULL,
    payment_status           payment_status NOT NULL DEFAULT 'pending',
    paid_at                  TIMESTAMPTZ,
    order_status             order_status NOT NULL DEFAULT 'payment_pending',
    payment_processed_at     TIMESTAMPTZ,
    merchant_action_at       TIMESTAMPTZ,
    merchant_action_by       UUID,
    merchant_rejection_reason TEXT,
    admin_override_at        TIMESTAMPTZ,
    admin_override_by        UUID,
    admin_override_note      TEXT,
    area_id                  UUID REFERENCES areas(id),
    is_within_delivery_zone  BOOLEAN NOT NULL DEFAULT TRUE,
    delivery_partner_id      UUID,
    delivery_otp             VARCHAR(10),
    delivery_otp_verified    BOOLEAN NOT NULL DEFAULT FALSE,
    delivery_proof_url       TEXT,
    expected_delivery_at     TIMESTAMPTZ,
    delivered_at             TIMESTAMPTZ,
    cancellation_reason      TEXT,
    cancelled_by             user_role,
    notes                    TEXT,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_orders_user    ON orders(user_id);
CREATE INDEX idx_orders_merchant ON orders(merchant_id);
CREATE INDEX idx_orders_status  ON orders(order_status);
CREATE INDEX idx_orders_area    ON orders(area_id);
CREATE INDEX idx_orders_number  ON orders(order_number);

CREATE TABLE order_items (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id       UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id     UUID NOT NULL REFERENCES products(id),
    variant_id     UUID REFERENCES product_variants(id),
    product_name   VARCHAR(300) NOT NULL,
    variant_name   VARCHAR(100),
    sku            VARCHAR(100),
    quantity       INT NOT NULL,
    unit_price     DECIMAL(12, 2) NOT NULL,
    mrp            DECIMAL(12, 2) NOT NULL,
    gst_percentage DECIMAL(5, 2) DEFAULT 0.00,
    line_total     DECIMAL(12, 2) NOT NULL,
    is_returned    BOOLEAN NOT NULL DEFAULT FALSE,
    return_quantity INT DEFAULT 0,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_order_items_order   ON order_items(order_id);
CREATE INDEX idx_order_items_product ON order_items(product_id);

CREATE TABLE order_status_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    from_status     order_status,
    to_status       order_status NOT NULL,
    changed_by_role user_role NOT NULL,
    changed_by_id   UUID NOT NULL,
    note            TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_order_status_logs_order ON order_status_logs(order_id);

CREATE TABLE return_requests (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id          UUID NOT NULL REFERENCES orders(id),
    user_id           UUID NOT NULL REFERENCES users(id),
    merchant_id       UUID NOT NULL REFERENCES merchants(id),
    reason            TEXT NOT NULL,
    return_items      JSONB NOT NULL,
    proof_images      TEXT[],
    status            VARCHAR(50) NOT NULL DEFAULT 'pending',
    merchant_response TEXT,
    admin_response    TEXT,
    refund_amount     DECIMAL(12, 2),
    approved_by       UUID,
    resolved_at       TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- SECTION 11: PAYMENTS
-- ============================================================

CREATE TABLE payments (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id             UUID REFERENCES orders(id),
    booking_id           UUID REFERENCES bookings(id),
    user_id              UUID NOT NULL REFERENCES users(id),
    amount               DECIMAL(12, 2) NOT NULL,
    currency             VARCHAR(5) NOT NULL DEFAULT 'INR',
    payment_method       payment_method NOT NULL,
    payment_status       payment_status NOT NULL DEFAULT 'pending',
    razorpay_order_id    TEXT,
    razorpay_payment_id  TEXT,
    razorpay_signature   TEXT,
    gateway_response     JSONB,
    failure_reason       TEXT,
    captured_at          TIMESTAMPTZ,
    refunded_at          TIMESTAMPTZ,
    refund_amount        DECIMAL(12, 2),
    refund_reference_id  TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payments_order ON payments(order_id);
CREATE INDEX idx_payments_user  ON payments(user_id);
CREATE INDEX idx_payments_rzp   ON payments(razorpay_payment_id);


-- ============================================================
-- SECTION 12: WALLET SYSTEM
-- ============================================================

CREATE TABLE wallets (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id       UUID NOT NULL,
    owner_type     VARCHAR(20) NOT NULL,
    balance        DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    locked_balance DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    total_credited DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    total_debited  DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(owner_id, owner_type)
);

CREATE TABLE wallet_transactions (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_id        UUID NOT NULL REFERENCES wallets(id),
    transaction_type transaction_type NOT NULL,
    amount           DECIMAL(12, 2) NOT NULL,
    closing_balance  DECIMAL(12, 2) NOT NULL,
    reference_type   VARCHAR(50),
    reference_id     UUID,
    description      TEXT,
    initiated_by     UUID,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_wallet_txn_wallet ON wallet_transactions(wallet_id);
CREATE INDEX idx_wallet_txn_ref    ON wallet_transactions(reference_id);


-- ============================================================
-- SECTION 13: DELIVERY PARTNERS
-- ============================================================

CREATE TABLE delivery_partners (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name         VARCHAR(200) NOT NULL,
    phone             VARCHAR(15) UNIQUE NOT NULL,
    email             VARCHAR(255),
    password_hash     TEXT NOT NULL,
    profile_image_url TEXT,
    vehicle_type      VARCHAR(50),
    vehicle_number    VARCHAR(20),
    aadhaar_number    VARCHAR(20),
    dl_number         VARCHAR(30),
    dl_url            TEXT,
    aadhaar_front_url TEXT,
    aadhaar_back_url  TEXT,
    area_id           UUID REFERENCES areas(id),
    current_latitude  DECIMAL(10, 8),
    current_longitude DECIMAL(11, 8),
    is_online         BOOLEAN NOT NULL DEFAULT FALSE,
    is_verified       BOOLEAN NOT NULL DEFAULT FALSE,
    is_active         BOOLEAN NOT NULL DEFAULT TRUE,
    rating            DECIMAL(3, 2) DEFAULT 0.00,
    total_deliveries  INT NOT NULL DEFAULT 0,
    wallet_balance    DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dp_area   ON delivery_partners(area_id);
CREATE INDEX idx_dp_online ON delivery_partners(is_online, is_active);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN
        EXECUTE 'ALTER TABLE delivery_partners ADD COLUMN IF NOT EXISTS current_geom geography(POINT, 4326)';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_dp_geom ON delivery_partners USING GIST(current_geom)';
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Could not add PostGIS column to delivery_partners: %', SQLERRM;
END;
$$;

CREATE TABLE delivery_assignments (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id        UUID NOT NULL UNIQUE REFERENCES orders(id),
    partner_id      UUID NOT NULL REFERENCES delivery_partners(id),
    assigned_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    picked_up_at    TIMESTAMPTZ,
    delivered_at    TIMESTAMPTZ,
    delivery_status delivery_status NOT NULL DEFAULT 'assigned',
    delivery_otp    VARCHAR(10),
    otp_verified    BOOLEAN NOT NULL DEFAULT FALSE,
    proof_image_url TEXT,
    proof_signature TEXT,
    failure_reason  TEXT,
    route_taken     JSONB,
    distance_km     DECIMAL(7, 2),
    earnings        DECIMAL(10, 2) DEFAULT 0.00,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_delivery_partner ON delivery_assignments(partner_id);
CREATE INDEX idx_delivery_order   ON delivery_assignments(order_id);


-- ============================================================
-- SECTION 14: REVIEWS & RATINGS
-- ============================================================

CREATE TABLE reviews (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id      UUID NOT NULL REFERENCES users(id),
    merchant_id  UUID REFERENCES merchants(id),
    product_id   UUID REFERENCES products(id),
    service_id   UUID REFERENCES services(id),
    order_id     UUID REFERENCES orders(id),
    booking_id   UUID REFERENCES bookings(id),
    rating       SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    title        VARCHAR(200),
    body         TEXT,
    images       TEXT[],
    is_verified  BOOLEAN NOT NULL DEFAULT FALSE,
    is_published BOOLEAN NOT NULL DEFAULT TRUE,
    admin_flagged BOOLEAN NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reviews_merchant ON reviews(merchant_id);
CREATE INDEX idx_reviews_product  ON reviews(product_id);
CREATE INDEX idx_reviews_user     ON reviews(user_id);


-- ============================================================
-- SECTION 15: ADMIN PANEL
-- ============================================================

CREATE TABLE admins (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name      VARCHAR(200) NOT NULL,
    email          VARCHAR(255) UNIQUE NOT NULL,
    phone          VARCHAR(15),
    password_hash  TEXT NOT NULL,
    role           VARCHAR(50) NOT NULL DEFAULT 'admin',
    permissions    JSONB DEFAULT '{}',
    allowed_ips    INET[],
    is_2fa_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    is_active      BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at  TIMESTAMPTZ,
    last_login_ip  INET,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE admin_audit_logs (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_id    UUID NOT NULL REFERENCES admins(id),
    action      VARCHAR(200) NOT NULL,
    entity_type VARCHAR(100),
    entity_id   UUID,
    old_values  JSONB,
    new_values  JSONB,
    ip_address  INET,
    user_agent  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_admin  ON admin_audit_logs(admin_id);
CREATE INDEX idx_audit_entity ON admin_audit_logs(entity_type, entity_id);

CREATE TABLE admin_device_logs (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_id    UUID NOT NULL REFERENCES admins(id),
    device_info JSONB,
    ip_address  INET,
    event       VARCHAR(50) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- SECTION 16: MARKETING & PROMOTIONS
-- ============================================================

CREATE TABLE coupons (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code                VARCHAR(50) UNIQUE NOT NULL,
    description         TEXT,
    coupon_type         coupon_type NOT NULL,
    discount_value      DECIMAL(10, 2) NOT NULL,
    max_discount_amount DECIMAL(10, 2),
    min_order_value     DECIMAL(10, 2) DEFAULT 0.00,
    merchant_id         UUID REFERENCES merchants(id),
    category_id         UUID REFERENCES categories(id),
    applicable_for      VARCHAR(20) DEFAULT 'all',
    max_uses            INT,
    uses_per_user       INT DEFAULT 1,
    used_count          INT NOT NULL DEFAULT 0,
    valid_from          TIMESTAMPTZ NOT NULL,
    valid_until         TIMESTAMPTZ NOT NULL,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_by          UUID REFERENCES admins(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE coupon_usage (
    id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    coupon_id UUID NOT NULL REFERENCES coupons(id),
    user_id   UUID NOT NULL REFERENCES users(id),
    order_id  UUID REFERENCES orders(id),
    used_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(coupon_id, user_id, order_id)
);

CREATE TABLE banners (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title            VARCHAR(200),
    subtitle         VARCHAR(300),
    image_url        TEXT NOT NULL,
    mobile_image_url TEXT,
    link_url         TEXT,
    link_type        VARCHAR(50),
    link_target_id   UUID,
    position         VARCHAR(50) NOT NULL DEFAULT 'hero',
    area_id          UUID REFERENCES areas(id),
    sort_order       SMALLINT DEFAULT 0,
    valid_from       TIMESTAMPTZ,
    valid_until      TIMESTAMPTZ,
    is_active        BOOLEAN NOT NULL DEFAULT TRUE,
    created_by       UUID REFERENCES admins(id),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE referrals (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    referrer_id   UUID NOT NULL REFERENCES users(id),
    referred_id   UUID NOT NULL REFERENCES users(id),
    referral_code VARCHAR(20) NOT NULL,
    reward_amount DECIMAL(10, 2) DEFAULT 0.00,
    is_rewarded   BOOLEAN NOT NULL DEFAULT FALSE,
    rewarded_at   TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(referrer_id, referred_id)
);


-- ============================================================
-- SECTION 17: NOTIFICATIONS
-- ============================================================

CREATE TABLE notifications (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipient_id      UUID NOT NULL,
    recipient_type    user_role NOT NULL,
    notification_type notification_type NOT NULL,
    title             VARCHAR(200) NOT NULL,
    body              TEXT NOT NULL,
    data              JSONB,
    is_read           BOOLEAN NOT NULL DEFAULT FALSE,
    is_sent_push      BOOLEAN NOT NULL DEFAULT FALSE,
    is_sent_sms       BOOLEAN NOT NULL DEFAULT FALSE,
    is_sent_whatsapp  BOOLEAN NOT NULL DEFAULT FALSE,
    sent_at           TIMESTAMPTZ,
    read_at           TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_recipient ON notifications(recipient_id, recipient_type);
CREATE INDEX idx_notifications_unread    ON notifications(recipient_id, is_read) WHERE is_read = FALSE;


-- ============================================================
-- SECTION 18: COMPLAINT & DISPUTE MANAGEMENT
-- ============================================================

CREATE TABLE complaint_tickets (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_number VARCHAR(30) UNIQUE NOT NULL,
    user_id       UUID NOT NULL REFERENCES users(id),
    order_id      UUID REFERENCES orders(id),
    booking_id    UUID REFERENCES bookings(id),
    merchant_id   UUID REFERENCES merchants(id),
    subject       VARCHAR(300) NOT NULL,
    description   TEXT NOT NULL,
    attachments   TEXT[],
    priority      VARCHAR(20) DEFAULT 'normal',
    status        VARCHAR(30) NOT NULL DEFAULT 'open',
    assigned_to   UUID REFERENCES admins(id),
    resolution    TEXT,
    resolved_at   TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ticket_replies (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id   UUID NOT NULL REFERENCES complaint_tickets(id) ON DELETE CASCADE,
    sender_id   UUID NOT NULL,
    sender_type user_role NOT NULL,
    message     TEXT NOT NULL,
    attachments TEXT[],
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tickets_user   ON complaint_tickets(user_id);
CREATE INDEX idx_tickets_status ON complaint_tickets(status);


-- ============================================================
-- SECTION 19: CMS PAGES
-- ============================================================

CREATE TABLE cms_pages (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title            VARCHAR(300) NOT NULL,
    slug             VARCHAR(300) UNIQUE NOT NULL,
    content          TEXT,
    meta_title       VARCHAR(300),
    meta_description VARCHAR(500),
    og_image_url     TEXT,
    is_published     BOOLEAN NOT NULL DEFAULT FALSE,
    published_at     TIMESTAMPTZ,
    created_by       UUID REFERENCES admins(id),
    updated_by       UUID REFERENCES admins(id),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- SECTION 20: MERCHANT LOYALTY & SPONSORED ADS
-- ============================================================

CREATE TABLE loyalty_programs (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id      UUID NOT NULL UNIQUE REFERENCES merchants(id) ON DELETE CASCADE,
    points_per_rupee DECIMAL(5, 2) DEFAULT 1.00,
    rupee_per_point  DECIMAL(5, 4) DEFAULT 0.10,
    min_redemption   INT DEFAULT 100,
    is_active        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE user_loyalty_points (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id        UUID NOT NULL REFERENCES users(id),
    merchant_id    UUID NOT NULL REFERENCES merchants(id),
    points_balance INT NOT NULL DEFAULT 0,
    total_earned   INT NOT NULL DEFAULT 0,
    total_redeemed INT NOT NULL DEFAULT 0,
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, merchant_id)
);

CREATE TABLE sponsored_ads (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id  UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    product_id   UUID REFERENCES products(id),
    ad_type      VARCHAR(50) NOT NULL,
    area_id      UUID REFERENCES areas(id),
    daily_budget DECIMAL(10, 2) NOT NULL,
    total_budget DECIMAL(10, 2) NOT NULL,
    spent_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    cpc          DECIMAL(8, 4),
    impressions  INT NOT NULL DEFAULT 0,
    clicks       INT NOT NULL DEFAULT 0,
    valid_from   TIMESTAMPTZ NOT NULL,
    valid_until  TIMESTAMPTZ NOT NULL,
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    approved_by  UUID REFERENCES admins(id),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- SECTION 21: MERCHANT SETTLEMENTS
-- ============================================================

CREATE TABLE merchant_settlements (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id          UUID NOT NULL REFERENCES merchants(id),
    settlement_period    VARCHAR(20),
    total_orders         INT NOT NULL DEFAULT 0,
    gross_amount         DECIMAL(12, 2) NOT NULL,
    platform_fee         DECIMAL(10, 2) NOT NULL,
    gst_on_fee           DECIMAL(10, 2) NOT NULL,
    tds                  DECIMAL(10, 2) DEFAULT 0.00,
    net_payable          DECIMAL(12, 2) NOT NULL,
    status               VARCHAR(30) NOT NULL DEFAULT 'pending',
    razorpay_transfer_id TEXT,
    processed_at         TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_settlements_merchant ON merchant_settlements(merchant_id);


-- ============================================================
-- SECTION 22: AREA-BASED AVAILABILITY VIEW (PostGIS optional)
-- ============================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN
        EXECUTE '
            CREATE OR REPLACE VIEW merchant_area_availability AS
            SELECT
                m.id AS merchant_id, m.store_name, m.store_slug, m.store_category,
                m.latitude AS merchant_lat, m.longitude AS merchant_lng,
                m.delivery_radius_km, m.is_open, m.merchant_status,
                a.id AS area_id, a.name AS area_name, a.pincode,
                ST_Distance(m.geom::geography, a.geom::geography) / 1000 AS distance_km,
                CASE WHEN ST_Distance(m.geom::geography, a.geom::geography) / 1000
                     <= m.delivery_radius_km THEN TRUE ELSE FALSE END AS is_within_zone
            FROM merchants m
            CROSS JOIN areas a
            WHERE m.merchant_status = ''active'' AND m.is_active = TRUE
        ';
    ELSE
        -- Simplified view without distance calculation
        EXECUTE '
            CREATE OR REPLACE VIEW merchant_area_availability AS
            SELECT
                m.id AS merchant_id, m.store_name, m.store_slug, m.store_category,
                m.latitude AS merchant_lat, m.longitude AS merchant_lng,
                m.delivery_radius_km, m.is_open, m.merchant_status,
                a.id AS area_id, a.name AS area_name, a.pincode,
                NULL::numeric AS distance_km,
                TRUE AS is_within_zone
            FROM merchants m
            CROSS JOIN areas a
            WHERE m.merchant_status = ''active'' AND m.is_active = TRUE
        ';
    END IF;
END;
$$;


-- ============================================================
-- SECTION 23: UPDATED_AT AUTO-TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE tbl TEXT;
BEGIN
    FOREACH tbl IN ARRAY ARRAY[
        'users', 'merchants', 'merchant_kyc', 'merchant_bank_details',
        'products', 'services', 'orders', 'bookings', 'carts', 'cart_items',
        'payments', 'wallets', 'reviews', 'admins', 'complaint_tickets',
        'cms_pages', 'return_requests', 'delivery_assignments'
    ]
    LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_update_%I
             BEFORE UPDATE ON %I
             FOR EACH ROW EXECUTE FUNCTION update_timestamp()',
            tbl, tbl
        );
    END LOOP;
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- SECTION 24: SEED DATA
-- ============================================================

INSERT INTO cities (name, state, country) VALUES
    ('Navi Mumbai', 'Maharashtra', 'India'),
    ('Mumbai', 'Maharashtra', 'India');

INSERT INTO areas (city_id, name, pincode, latitude, longitude)
SELECT id, 'Kharghar Sector 12', '410210', 19.0474, 73.0692 FROM cities WHERE name = 'Navi Mumbai'
UNION ALL
SELECT id, 'Kharghar Sector 15', '410210', 19.0490, 73.0701 FROM cities WHERE name = 'Navi Mumbai'
UNION ALL
SELECT id, 'Kharghar Sector 20', '410210', 19.0520, 73.0680 FROM cities WHERE name = 'Navi Mumbai'
UNION ALL
SELECT id, 'Kharghar Sector 23', '410210', 19.0540, 73.0690 FROM cities WHERE name = 'Navi Mumbai'
UNION ALL
SELECT id, 'Panvel Old', '410206', 18.9943, 73.1145 FROM cities WHERE name = 'Navi Mumbai';

-- Update PostGIS geom from lat/lng only if PostGIS is available
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN
        EXECUTE 'UPDATE areas SET geom = ST_MakePoint(longitude, latitude)::geography WHERE geom IS NULL';
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Could not update area geom: %', SQLERRM;
END;
$$;

INSERT INTO categories (name, slug, theme_color, store_category, sort_order) VALUES
    ('Grocery & FMCG',     'grocery-fmcg',      '#22c55e', 'grocery_fmcg',      1),
    ('Wholesale Market',   'wholesale',          '#f97316', 'wholesale',          2),
    ('Electronics',        'electronics',        '#3b82f6', 'electronics',        3),
    ('Hardware',           'hardware',           '#78716c', 'hardware',           4),
    ('Clothing & Fashion', 'clothing',           '#ec4899', 'clothing',           5),
    ('Medical Store',      'medical',            '#ef4444', 'medical',            6),
    ('Doctor Booking',     'doctor-booking',     '#06b6d4', 'service',            7),
    ('Men''s Salon',       'mens-salon',         '#1e3a8a', 'service',            8),
    ('Women''s Salon',     'womens-salon',       '#f9a8d4', 'service',            9),
    ('Home Services',      'home-services',      '#eab308', 'service',           10),
    ('Tea Stall',          'tea-stall',          '#f97316', 'food_tea_stall',    11),
    ('Chaat & Chinese',    'chaat-chinese',      '#dc2626', 'food_chaat_chinese', 12),
    ('Specialty Stores',   'specialty',          '#8b5cf6', 'specialty',         13);

INSERT INTO admins (full_name, email, phone, password_hash, role, is_2fa_enabled) VALUES
    ('Catalyst Admin', 'admin@mylocalbazaar.store', '+919999999999',
     '$2b$12$PLACEHOLDER_HASH_CHANGE_BEFORE_PRODUCTION',
     'superadmin', TRUE);

-- ============================================================
-- END OF SCHEMA — Tables: 40+ | Indexes: 50+ | Triggers: 20+
-- ============================================================
