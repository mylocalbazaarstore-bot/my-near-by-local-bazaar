-- Migration 006: Insert Furniture Store category row
-- Runs after 005 has committed so 'furniture' enum value is visible.
INSERT INTO categories (name, slug, theme_color, store_category, sort_order)
VALUES ('Furniture Store', 'furniture', '#92400E', 'furniture', 17)
ON CONFLICT (slug) DO NOTHING;
