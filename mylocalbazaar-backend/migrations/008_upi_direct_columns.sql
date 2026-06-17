-- Migration 008: Add UPI Direct columns (runs after 007 commits)
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS upi_id VARCHAR(100);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_utr VARCHAR(50);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_screenshot_url TEXT;
