-- 003_refund_manual_status.sql
-- ─────────────────────────────────────────────────────────────
-- Adds an explicit order status for refunds the platform CANNOT
-- process automatically — e.g. UPI-Direct, where the customer paid
-- the merchant's UPI directly and the platform never held the funds.
--
-- Subscription-only model: these refunds are issued MANUALLY by the
-- merchant, so the order must not be falsely marked 'refund_initiated'.
--
-- Safe inside the migrate.js BEGIN/COMMIT wrapper (PG 12+): the value
-- is only ADDED here, never USED in the same transaction.
-- ─────────────────────────────────────────────────────────────

ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'refund_manual_pending';
