-- Appointment booking hardening and extension.
-- Keeps existing product/cart/order flow untouched.
-- Production preflight: this migration aborts before creating the unique
-- slot index if duplicate provider/date/start-time rows already exist.
-- Resolve duplicates manually by merging/deleting/blocking old rows, then rerun.

ALTER TYPE booking_status ADD VALUE IF NOT EXISTS 'rejected';

ALTER TABLE service_slots
  ADD COLUMN IF NOT EXISTS service_id UUID REFERENCES services(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS customer_name VARCHAR(200),
  ADD COLUMN IF NOT EXISTS customer_mobile VARCHAR(20),
  ADD COLUMN IF NOT EXISTS customer_email VARCHAR(200),
  ADD COLUMN IF NOT EXISTS start_time TIME,
  ADD COLUMN IF NOT EXISTS end_time TIME,
  ADD COLUMN IF NOT EXISTS address_text TEXT,
  ADD COLUMN IF NOT EXISTS location_lat DECIMAL(10, 8),
  ADD COLUMN IF NOT EXISTS location_lng DECIMAL(11, 8),
  ADD COLUMN IF NOT EXISTS payment_method VARCHAR(30) NOT NULL DEFAULT 'pay_at_shop',
  ADD COLUMN IF NOT EXISTS payment_reference_id VARCHAR(150),
  ADD COLUMN IF NOT EXISTS cancelled_by user_role;

DO $$
DECLARE
  invalid_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO invalid_count
  FROM bookings
  WHERE payment_method IS NOT NULL
    AND payment_method NOT IN ('none', 'pay_at_shop', 'online', 'cash', 'upi', 'card');

  IF invalid_count > 0 THEN
    RAISE EXCEPTION
      'Invalid bookings.payment_method values found. Run: SELECT payment_method, COUNT(*) FROM bookings GROUP BY payment_method; Normalize to none/pay_at_shop/online/cash/upi/card before rerunning migration.';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_bookings_payment_method'
      AND conrelid = 'bookings'::regclass
  ) THEN
    ALTER TABLE bookings
      ADD CONSTRAINT chk_bookings_payment_method
      CHECK (
        payment_method IS NULL OR
        payment_method IN ('none', 'pay_at_shop', 'online', 'cash', 'upi', 'card')
      );
  END IF;
END $$;

UPDATE bookings
SET start_time = COALESCE(start_time, booking_time)
WHERE start_time IS NULL;

DO $$
DECLARE
  duplicate_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO duplicate_count
  FROM (
    SELECT provider_id, slot_date, start_time
    FROM service_slots
    WHERE is_active = true
    GROUP BY provider_id, slot_date, start_time
    HAVING COUNT(*) > 1
  ) duplicate_slots;

  IF duplicate_count > 0 THEN
    RAISE EXCEPTION
      'Duplicate service_slots found for provider_id + slot_date + start_time. Run: SELECT provider_id, slot_date, start_time, COUNT(*) FROM service_slots GROUP BY provider_id, slot_date, start_time HAVING COUNT(*) > 1; Resolve duplicates before rerunning migration.';
  END IF;
END $$;

DROP INDEX IF EXISTS idx_slots_provider_date_start;

CREATE UNIQUE INDEX IF NOT EXISTS idx_slots_provider_date_start
  ON service_slots(provider_id, slot_date, start_time)
  WHERE is_active = true;

CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_active_slot
  ON bookings(slot_id)
  WHERE slot_id IS NOT NULL
    AND booking_status IN ('pending', 'confirmed', 'in_progress');

CREATE INDEX IF NOT EXISTS idx_services_category_active
  ON services(category_id, is_active);

CREATE INDEX IF NOT EXISTS idx_bookings_merchant_status_date
  ON bookings(merchant_id, booking_status, booking_date);
