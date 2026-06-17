-- Migration 005: Add 'furniture' to store_category ENUM
-- Must run in its OWN transaction (committed) before 006 can INSERT using this value.
ALTER TYPE store_category ADD VALUE IF NOT EXISTS 'furniture';
