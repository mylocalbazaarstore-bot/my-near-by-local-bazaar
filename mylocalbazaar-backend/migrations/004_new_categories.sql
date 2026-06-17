-- ============================================================
-- MIGRATION: 004_new_categories.sql
-- MyLocalBazaar.store
-- Inserts Jewellery Store, Restaurant, and Banquet Hall
-- category rows. Depends on 003_add_food_restaurant_enum.sql
-- having been committed first (which the migration runner
-- guarantees by running files alphabetically in separate
-- transactions).
--
-- Run: node scripts/migrate.js
-- ============================================================

INSERT INTO categories (name, slug, theme_color, store_category, sort_order)
VALUES
  ('Jewellery Store', 'jewellery',    '#F59E0B', 'specialty',       14),
  ('Restaurant',      'restaurant',   '#EA580C', 'food_restaurant', 15),
  ('Banquet Hall',    'banquet-hall', '#6366F1', 'service',         16)
ON CONFLICT (slug) DO NOTHING;
