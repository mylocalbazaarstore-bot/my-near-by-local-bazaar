-- Migration 007: Add upi_direct to payment_method ENUM
-- Must fully commit before 008 can insert/use the new value.
ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'upi_direct';
