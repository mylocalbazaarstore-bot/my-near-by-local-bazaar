// src/services/cart.service.js
// ─────────────────────────────────────────────────────────────
// Cart Service — MyLocalBazaar.store
//
// KEY BUSINESS RULES (from master prompt):
//   1. Single-merchant cart restriction
//      → Adding from a different merchant clears existing cart first
//   2. Merchant minimum order validation
//      → enforced at checkout, previewed at cart
//   3. MOQ (minimum order quantity) per product
//   4. Live stock check on every cart operation
//   5. Coupon preview without applying (for UI feedback)
// ─────────────────────────────────────────────────────────────

const { query, withTransaction } = require('../config/db');
const { redis }                  = require('../config/redis');
const logger                     = require('../config/logger');

// ── Cart cache key ────────────────────────────────────────────
const cartCacheKey = (userId) => `mlb:cart_detail:${userId}`;

const CartService = {

  // ── Get or create cart for user ────────────────────────────
  getOrCreate: async (userId) => {
    const { rows } = await query(
      'SELECT * FROM carts WHERE user_id = $1 LIMIT 1',
      [userId]
    );
    if (rows[0]) return rows[0];

    const { rows: created } = await query(
      'INSERT INTO carts (user_id) VALUES ($1) RETURNING *',
      [userId]
    );
    return created[0];
  },

  // ── Fetch full cart with computed totals ───────────────────
  getFullCart: async (userId) => {
    const cached = await redis.get(cartCacheKey(userId));
    if (cached) return cached;

    const cart = await CartService.getOrCreate(userId);

    const { rows: items } = await query(
      `SELECT
         ci.id AS cart_item_id,
         ci.quantity, ci.unit_price,
         p.id AS product_id, p.name, p.slug, p.unit,
         p.mrp, p.retail_price, p.stock_quantity,
         p.moq, p.gst_percentage, p.is_returnable,
         p.product_status,
         pv.id AS variant_id, pv.variant_name, pv.variant_type,
         pv.retail_price AS variant_price, pv.stock_quantity AS variant_stock,
         m.id AS merchant_id, m.store_name, m.store_slug,
         m.min_order_value, m.delivery_radius_km, m.is_open,
         m.merchant_status, m.accepts_cod,
         (SELECT image_url FROM product_images pi
          WHERE pi.product_id = p.id AND pi.is_primary = true LIMIT 1) AS image
       FROM cart_items ci
       JOIN products  p  ON p.id  = ci.product_id
       JOIN merchants m  ON m.id  = p.merchant_id
       LEFT JOIN product_variants pv ON pv.id = ci.variant_id
       WHERE ci.cart_id = $1
       ORDER BY ci.created_at ASC`,
      [cart.id]
    );

    // Compute cart totals
    let subtotal       = 0;
    let totalGst       = 0;
    let itemCount      = 0;
    const validationWarnings = [];

    const enrichedItems = items.map((item) => {
      const unitPrice      = parseFloat(item.variant_id ? item.variant_price : item.retail_price);
      const lineTotal      = unitPrice * item.quantity;
      const gstAmount      = lineTotal * (parseFloat(item.gst_percentage) / 100);
      const availableStock = item.variant_id ? item.variant_stock : item.stock_quantity;

      subtotal  += lineTotal;
      totalGst  += gstAmount;
      itemCount += item.quantity;

      // Stock warning
      if (item.product_status !== 'active') {
        validationWarnings.push({
          product_id: item.product_id,
          message:    `"${item.name}" is no longer available`,
          type:       'product_unavailable',
        });
      } else if (availableStock < item.quantity) {
        validationWarnings.push({
          product_id: item.product_id,
          message:    `Only ${availableStock} units of "${item.name}" are in stock`,
          type:       'insufficient_stock',
          available:  availableStock,
        });
      }

      // MOQ warning
      if (item.quantity < item.moq) {
        validationWarnings.push({
          product_id: item.product_id,
          message:    `Minimum order quantity for "${item.name}" is ${item.moq}`,
          type:       'moq_not_met',
          moq:        item.moq,
        });
      }

      return {
        ...item,
        unit_price:  unitPrice,
        line_total:  parseFloat(lineTotal.toFixed(2)),
        gst_amount:  parseFloat(gstAmount.toFixed(2)),
      };
    });

    // Min order check
    const merchant    = items[0] || null;
    const minOrder    = merchant ? parseFloat(merchant.min_order_value) : 0;
    const belowMinOrder = subtotal < minOrder && subtotal > 0;
    if (belowMinOrder) {
      validationWarnings.push({
        type:    'below_minimum_order',
        message: `Minimum order value for this store is ₹${minOrder.toFixed(2)}. Add ₹${(minOrder - subtotal).toFixed(2)} more.`,
        min_order_value: minOrder,
        current_subtotal: parseFloat(subtotal.toFixed(2)),
      });
    }

    const cartData = {
      cart_id:    cart.id,
      merchant_id: cart.merchant_id,
      items:       enrichedItems,
      item_count:  itemCount,
      totals: {
        subtotal:         parseFloat(subtotal.toFixed(2)),
        gst:              parseFloat(totalGst.toFixed(2)),
        delivery_charge:  0,  // calculated at checkout based on address
        total:            parseFloat((subtotal + totalGst).toFixed(2)),
      },
      validation: {
        is_valid:         validationWarnings.length === 0,
        below_min_order:  belowMinOrder,
        min_order_value:  minOrder,
        warnings:         validationWarnings,
      },
      merchant: merchant ? {
        id:              merchant.merchant_id,
        store_name:      merchant.store_name,
        store_slug:      merchant.store_slug,
        is_open:         merchant.is_open,
        merchant_status: merchant.merchant_status,
        accepts_cod:     merchant.accepts_cod,
      } : null,
    };

    await redis.set(cartCacheKey(userId), cartData, 120); // 2 min cache
    return cartData;
  },

  // ── Add item (enforces single-merchant restriction) ────────
  addItem: async (userId, { product_id, variant_id = null, quantity }) => {
    return withTransaction(async (client) => {
      // 1. Verify product is purchasable
      const { rows: productRows } = await client.query(
        `SELECT p.id, p.merchant_id, p.product_status, p.moq,
                p.retail_price, p.stock_quantity, p.track_inventory,
                m.merchant_status, m.is_open, m.min_order_value,
                m.store_name
         FROM products p
         JOIN merchants m ON m.id = p.merchant_id
         WHERE p.id = $1`,
        [product_id]
      );

      const product = productRows[0];
      if (!product) {
        throw Object.assign(new Error('Product not found'), { statusCode: 404 });
      }
      if (product.product_status !== 'active') {
        throw Object.assign(new Error('This product is not available'), { statusCode: 400 });
      }
      if (product.merchant_status !== 'active') {
        throw Object.assign(new Error('This store is currently unavailable'), { statusCode: 400 });
      }

      // 2. Validate variant if provided
      let unitPrice = parseFloat(product.retail_price);
      let variantStock = null;

      if (variant_id) {
        const { rows: variantRows } = await client.query(
          `SELECT id, retail_price, stock_quantity, is_active
           FROM product_variants WHERE id = $1 AND product_id = $2`,
          [variant_id, product_id]
        );
        const variant = variantRows[0];
        if (!variant || !variant.is_active) {
          throw Object.assign(new Error('Selected variant is not available'), { statusCode: 400 });
        }
        unitPrice    = parseFloat(variant.retail_price);
        variantStock = parseInt(variant.stock_quantity);
      }

      // 3. Stock check
      const availableStock = variant_id ? variantStock : parseInt(product.stock_quantity);
      if (product.track_inventory && availableStock < quantity) {
        throw Object.assign(
          new Error(`Only ${availableStock} unit(s) available for this product`),
          { statusCode: 400 }
        );
      }

      // 4. MOQ check
      if (quantity < product.moq) {
        throw Object.assign(
          new Error(`Minimum order quantity is ${product.moq} unit(s)`),
          { statusCode: 400 }
        );
      }

      // 5. Get or create cart
      const { rows: cartRows } = await client.query(
        'SELECT * FROM carts WHERE user_id = $1 LIMIT 1',
        [userId]
      );

      let cart = cartRows[0];

      if (!cart) {
        const { rows: newCart } = await client.query(
          'INSERT INTO carts (user_id, merchant_id) VALUES ($1, $2) RETURNING *',
          [userId, product.merchant_id]
        );
        cart = newCart[0];
      }

      // ★ SINGLE-MERCHANT RESTRICTION ★
      // If cart belongs to a different merchant → clear + reassign
      if (cart.merchant_id && cart.merchant_id !== product.merchant_id) {
        await client.query('DELETE FROM cart_items WHERE cart_id = $1', [cart.id]);
        await client.query(
          'UPDATE carts SET merchant_id = $1, updated_at = NOW() WHERE id = $2',
          [product.merchant_id, cart.id]
        );
        logger.info('Cart cleared for merchant switch', {
          userId,
          old_merchant: cart.merchant_id,
          new_merchant: product.merchant_id,
        });
      }

      if (!cart.merchant_id) {
        await client.query(
          'UPDATE carts SET merchant_id = $1 WHERE id = $2',
          [product.merchant_id, cart.id]
        );
      }

      // 6. Upsert cart item (add or increase quantity)
      const { rows: itemRows } = await client.query(
        `INSERT INTO cart_items (cart_id, product_id, variant_id, quantity, unit_price)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (cart_id, product_id, variant_id)
         DO UPDATE SET
           quantity   = cart_items.quantity + EXCLUDED.quantity,
           unit_price = EXCLUDED.unit_price,
           updated_at = NOW()
         RETURNING *`,
        [cart.id, product_id, variant_id, quantity, unitPrice]
      );

      await redis.del(cartCacheKey(userId));
      return {
        cart_item:   itemRows[0],
        merchant_id: product.merchant_id,
        store_name:  product.store_name,
        cart_switched: cart.merchant_id !== null && cart.merchant_id !== product.merchant_id,
      };
    });
  },

  // ── Update item quantity ────────────────────────────────────
  updateItem: async (userId, cartItemId, quantity) => {
    const cart = await CartService.getOrCreate(userId);

    // Verify item belongs to this user's cart
    const { rows: itemRows } = await query(
      `SELECT ci.*, p.moq, p.track_inventory,
              CASE WHEN ci.variant_id IS NULL THEN p.stock_quantity
                   ELSE pv.stock_quantity END AS available_stock
       FROM cart_items ci
       JOIN products p ON p.id = ci.product_id
       LEFT JOIN product_variants pv ON pv.id = ci.variant_id
       WHERE ci.id = $1 AND ci.cart_id = $2`,
      [cartItemId, cart.id]
    );

    const item = itemRows[0];
    if (!item) throw Object.assign(new Error('Cart item not found'), { statusCode: 404 });

    if (item.track_inventory && parseInt(item.available_stock) < quantity) {
      throw Object.assign(
        new Error(`Only ${item.available_stock} unit(s) available`),
        { statusCode: 400 }
      );
    }
    if (quantity < item.moq) {
      throw Object.assign(
        new Error(`Minimum quantity for this product is ${item.moq}`),
        { statusCode: 400 }
      );
    }

    await query(
      'UPDATE cart_items SET quantity = $1, updated_at = NOW() WHERE id = $2',
      [quantity, cartItemId]
    );

    await redis.del(cartCacheKey(userId));
    return { updated: true };
  },

  // ── Remove item ────────────────────────────────────────────
  removeItem: async (userId, cartItemId) => {
    const cart = await CartService.getOrCreate(userId);
    const { rowCount } = await query(
      'DELETE FROM cart_items WHERE id = $1 AND cart_id = $2',
      [cartItemId, cart.id]
    );
    if (!rowCount) throw Object.assign(new Error('Cart item not found'), { statusCode: 404 });

    // If cart is now empty, clear merchant_id
    const { rows } = await query(
      'SELECT COUNT(*) AS cnt FROM cart_items WHERE cart_id = $1', [cart.id]
    );
    if (parseInt(rows[0].cnt) === 0) {
      await query('UPDATE carts SET merchant_id = NULL WHERE id = $1', [cart.id]);
    }

    await redis.del(cartCacheKey(userId));
    return { removed: true };
  },

  // ── Clear entire cart ──────────────────────────────────────
  clear: async (userId) => {
    const cart = await CartService.getOrCreate(userId);
    await query('DELETE FROM cart_items WHERE cart_id = $1', [cart.id]);
    await query('UPDATE carts SET merchant_id = NULL WHERE id = $1', [cart.id]);
    await redis.del(cartCacheKey(userId));
    return { cleared: true };
  },

  // ── Validate cart is ready for checkout ───────────────────
  validateForCheckout: async (userId) => {
    const cart = await CartService.getFullCart(userId);

    const errors = [];

    if (!cart.items.length) {
      errors.push('Your cart is empty');
    }

    if (cart.merchant && cart.merchant.merchant_status !== 'active') {
      errors.push('This store is no longer available');
    }

    if (cart.merchant && !cart.merchant.is_open) {
      errors.push('This store is currently closed. Please try again later.');
    }

    cart.validation.warnings.forEach((w) => {
      if (w.type === 'product_unavailable' || w.type === 'insufficient_stock') {
        errors.push(w.message);
      }
      if (w.type === 'below_minimum_order') {
        errors.push(w.message);
      }
    });

    return { valid: errors.length === 0, errors, cart };
  },
};

module.exports = CartService;
