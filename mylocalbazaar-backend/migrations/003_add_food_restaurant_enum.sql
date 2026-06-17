-- ============================================================
-- MIGRATION: 003_add_food_restaurant_enum.sql
-- MyLocalBazaar.store
-- Adds 'food_restaurant' to the store_category ENUM.
--
-- MUST be a separate migration from the INSERT that uses this
-- value (004_new_categories.sql). The migration runner wraps
-- each file in BEGIN/COMMIT. In PostgreSQL 12+, ALTER TYPE …
-- ADD VALUE commits successfully inside a transaction, but the
-- new enum value is not visible to other statements in that
-- same transaction — so the INSERT in 004 must run in the
-- next transaction after this one commits.
--
-- Run: node scripts/migrate.js
-- ============================================================

ALTER TYPE store_category ADD VALUE IF NOT EXISTS 'food_restaurant';
