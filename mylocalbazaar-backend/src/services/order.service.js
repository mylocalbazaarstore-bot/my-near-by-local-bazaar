// src/services/order.service.js
// ─────────────────────────────────────────────────────────────
// Order Service — MyLocalBazaar.store
//
// ★ DOUBLE-APPROVAL LOGIC (from master prompt) ★
//
// Step 1: Customer places order → status: payment_pending
// Step 2: Payment captured (Razorpay webhook / COD) → payment_processed
//         → Merchant notified immediately
// Step 3: Merchant approves  → merchant_approved → accepted
//         Merchant rejects   → merchant_rejected  → refund triggered
//         Admin overrides    → admin_overridden   → accepted / cancelled
// Step 4: Merchant packs     → packed
// Step 5: Picked up          → out_for_delivery + Delivery OTP generated
// Step 6: Delivered + OTP    → delivered + proof uploaded
//
// AREA-BASED AVAILABILITY is verified before order creation
// ─────────────────────────────────────────────────────────────

const { query, withTransaction } = require('../config/db');
const { redis }                  = require('../config/redis');
const { MerchantDiscoveryService } = require('./area.service');
const CouponService              = require('./coupon.service');
const {
  generateOrderNumber,
  generateDeliveryOTP,
} = require('../utils/generators');
const {
  createRazorpayOrder,
  verifyPaymentSignature,
  initiateRefund,
} = require('../config/razorpay');
const logger = require('../config/logger');

// ─────────────────────────────────────────────────────────────
// DELIVERY CHARGE CALCULATOR
// ─────────────────────────────────────────────────────────────
const calcDeliveryCharge = (subtotal, distanceKm) => {
  const base    = parseFloat(process.env.DELIVERY_BASE_CHARGE   || 20);
  const perKm   = parseFloat(process.env.DELIVERY_PER_KM_CHARGE || 5);
  const freeAbove = parseFloat(process.env.FREE_DELIVERY_ABOVE  || 500);

  if (subtotal >= freeAbove) return 0;
  return parseFloat((base + distanceKm * perKm).toFixed(2));
};

// ─────────────────────────────────────────────────────────────
// LOG ORDER STATUS CHANGE
// ─────────────────────────────────────────────────────────────
const logStatusChange = async (client, orderId, fromStatus, toStatus, role, actorId, note = null) => {
  await client.query(
    `INSERT INTO order_status_logs (order_id, from_status, to_status, changed_by_role, changed_by_id, note)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [orderId, fromStatus, toStatus, role, actorId, note]
  );
};

// ─────────────────────────────────────────────────────────────
// SEND NOTIFICATION (non-blocking fire-and-forget)
// ─────────────────────────────────────────────────────────────
const notify = async (recipientId, recipientType, type, title, body, data = {}) => {
  try {
    await query(
      `INSERT INTO notifications (recipient_id, recipient_type, notification_type, title, body, data)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [recipientId, recipientType, type, title, body, JSON.stringify(data)]
    );
  } catch (err) {
    logger.warn('Notification insert failed:', { message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// WALLET DEDUCTION HELPER
// ─────────────────────────────────────────────────────────────
const deductWallet = async (client, userId, amount, orderId) => {
  const { rows } = await client.query(
    `UPDATE wallets
     SET balance       = balance - $1,
         total_debited = total_debited + $1,
         updated_at    = NOW()
     WHERE owner_id = $2 AND owner_type = 'customer' AND balance >= $1
     RETURNING balance`,
    [amount, userId]
  );
  if (!rows[0]) {
    throw Object.assign(new Error('Insufficient wallet balance'), { statusCode: 400 });
  }
  await client.query(
    `INSERT INTO wallet_transactions
       (wallet_id, transaction_type, amount, closing_balance, reference_type, reference_id, description)
     SELECT w.id, 'debit', $1, $2, 'order', $3, 'Order payment'
     FROM wallets w WHERE w.owner_id = $4 AND w.owner_type = 'customer'`,
    [amount, rows[0].balance, orderId, userId]
  );
};

// ─────────────────────────────────────────────────────────────
// MAIN ORDER SERVICE
// ─────────────────────────────────────────────────────────────
const OrderService = {

  // ════════════════════════════════════════════════════════════
  // STEP 1: PLACE ORDER
  // Creates the order record and initiates payment
  // ════════════════════════════════════════════════════════════
  place: async (userId, { address_id, payment_method, coupon_code, notes, use_wallet }) => {
    return withTransaction(async (client) => {

      // 1a. Validate cart is ready
      const CartService = require('./cart.service');
      const { valid, errors, cart } = await CartService.validateForCheckout(userId);
      if (!valid) {
        throw Object.assign(new Error(errors.join('. ')), { statusCode: 400 });
      }

      // 1b. Fetch delivery address (snapshot for order)
      const { rows: addrRows } = await client.query(
        `SELECT ua.*, a.id AS area_id, a.name AS area_name
         FROM user_addresses ua
         LEFT JOIN areas a ON a.id = ua.area_id
         WHERE ua.id = $1 AND ua.user_id = $2`,
        [address_id, userId]
      );
      const address = addrRows[0];
      if (!address) {
        throw Object.assign(new Error('Delivery address not found'), { statusCode: 404 });
      }

      // 1c. Area-based delivery zone verification (PostGIS)
      const merchantId = cart.merchant_id;
      let deliveryCharge = 0;
      let isWithinZone   = true;

      if (address.latitude && address.longitude) {
        const zoneCheck = await MerchantDiscoveryService.isAddressInDeliveryZone(
          merchantId, address_id
        );
        isWithinZone   = zoneCheck.withinZone;
        const distKm   = parseFloat(zoneCheck.distance_km || 0);
        deliveryCharge = calcDeliveryCharge(cart.totals.subtotal, distKm);

        if (!isWithinZone) {
          throw Object.assign(
            new Error(`This store does not deliver to your address. Delivery radius: ${zoneCheck.delivery_radius_km}km, your distance: ${zoneCheck.distance_km}km`),
            { statusCode: 400, code: 'OUTSIDE_DELIVERY_ZONE' }
          );
        }
      }

      // 1d. Coupon validation
      let couponData     = null;
      let discountAmount = 0;

      if (coupon_code) {
        // Check if user is new (for new_user coupons)
        const { rows: orderCheck } = await client.query(
          'SELECT COUNT(*) AS cnt FROM orders WHERE user_id = $1', [userId]
        );
        const isNewUser = parseInt(orderCheck[0].cnt) === 0;

        couponData = await CouponService.validate(coupon_code, {
          userId, merchantId,
          subtotal: cart.totals.subtotal,
          isNewUser,
        });

        discountAmount = couponData.discount_amount;
        if (couponData.free_delivery) deliveryCharge = 0;
      }

      // 1e. Calculate final totals
      const subtotal   = cart.totals.subtotal;
      const gstAmount  = cart.totals.gst;
      const totalAmount = parseFloat(
        Math.max(0, subtotal - discountAmount + deliveryCharge + gstAmount).toFixed(2)
      );

      // 1f. Wallet partial payment
      let walletDeduction = 0;
      if (use_wallet && payment_method !== 'wallet') {
        const { rows: walletRows } = await client.query(
          `SELECT balance FROM wallets WHERE owner_id = $1 AND owner_type = 'customer'`,
          [userId]
        );
        const walletBalance = parseFloat(walletRows[0]?.balance || 0);
        walletDeduction = Math.min(walletBalance, totalAmount);
      }
      const payableAmount = parseFloat((totalAmount - walletDeduction).toFixed(2));

      // 1g. Create order record
      const orderNumber = generateOrderNumber();
      const { rows: orderRows } = await client.query(
        `INSERT INTO orders (
           order_number, user_id, merchant_id,
           delivery_address, area_id, is_within_delivery_zone,
           subtotal, discount_amount, coupon_code, delivery_charge, gst_amount, total_amount,
           payment_method, payment_status, order_status, notes
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'pending','payment_pending',$14)
         RETURNING *`,
        [
          orderNumber, userId, merchantId,
          JSON.stringify({               // address snapshot
            label:         address.label,
            full_name:     address.full_name,
            phone:         address.phone,
            address_line1: address.address_line1,
            address_line2: address.address_line2,
            landmark:      address.landmark,
            pincode:       address.pincode,
            city:          address.city,
            state:         address.state,
            area_name:     address.area_name,
          }),
          address.area_id, isWithinZone,
          subtotal, discountAmount, coupon_code || null,
          deliveryCharge, gstAmount, totalAmount,
          payment_method,
          notes || null,
        ]
      );

      const order = orderRows[0];

      // 1h. Insert order items (snapshot product details)
      for (const item of cart.items) {
        await client.query(
          `INSERT INTO order_items
             (order_id, product_id, variant_id, product_name, variant_name, sku,
              quantity, unit_price, mrp, gst_percentage, line_total)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            order.id,
            item.product_id,
            item.variant_id || null,
            item.name,
            item.variant_name || null,
            item.sku || null,
            item.quantity,
            item.unit_price,
            parseFloat(item.mrp),
            parseFloat(item.gst_percentage),
            item.line_total,
          ]
        );
      }

      // 1i. Record coupon usage
      if (couponData) {
        await CouponService.recordUsage(client, couponData.coupon_id, userId, order.id);
      }

      // 1j. Deduct wallet if applicable
      if (walletDeduction > 0) {
        await deductWallet(client, userId, walletDeduction, order.id);
      }

      // 1k. For COD: skip payment gateway, move to payment_processed immediately
      if (payment_method === 'cod') {
        await client.query(
          `UPDATE orders
           SET order_status = 'payment_processed', payment_status = 'captured',
               payment_processed_at = NOW(), paid_at = NOW()
           WHERE id = $1`,
          [order.id]
        );
        await logStatusChange(client, order.id, 'payment_pending', 'payment_processed', 'customer', userId, 'COD order');

        // Notify merchant immediately
        notify(merchantId, 'merchant', 'order',
          '🛒 New Order Received!',
          `Order ${orderNumber} worth ₹${totalAmount} is awaiting your approval`,
          { order_id: order.id, order_number: orderNumber }
        );

        // Clear cart
        await client.query(
          'DELETE FROM cart_items WHERE cart_id = (SELECT id FROM carts WHERE user_id = $1)',
          [userId]
        );
        await client.query(
          'UPDATE carts SET merchant_id = NULL WHERE user_id = $1', [userId]
        );
        await redis.del(`mlb:cart_detail:${userId}`);

        return {
          order: { ...order, order_status: 'payment_processed', payment_status: 'captured' },
          payment: { method: 'cod', payable: payableAmount },
          message: 'Order placed! Awaiting merchant confirmation.',
        };
      }

      // 1l. For wallet-only payment
      if (payment_method === 'wallet') {
        await deductWallet(client, userId, totalAmount, order.id);
        await client.query(
          `UPDATE orders
           SET order_status = 'payment_processed', payment_status = 'captured',
               payment_processed_at = NOW(), paid_at = NOW()
           WHERE id = $1`,
          [order.id]
        );
        await logStatusChange(client, order.id, 'payment_pending', 'payment_processed', 'customer', userId, 'Wallet payment');

        notify(merchantId, 'merchant', 'order',
          '🛒 New Order!',
          `Order ${orderNumber} paid via Wallet. Awaiting your approval.`,
          { order_id: order.id }
        );

        await client.query(
          'DELETE FROM cart_items WHERE cart_id = (SELECT id FROM carts WHERE user_id = $1)',
          [userId]
        );
        await client.query('UPDATE carts SET merchant_id = NULL WHERE user_id = $1', [userId]);
        await redis.del(`mlb:cart_detail:${userId}`);

        return {
          order: { ...order, order_status: 'payment_processed' },
          payment: { method: 'wallet' },
          message: 'Order placed! Awaiting merchant confirmation.',
        };
      }

      // 1m. For Razorpay / UPI: create payment order
      const razorpayOrder = await createRazorpayOrder({
        amount:  payableAmount,
        receipt: order.order_number,
        notes:   { order_id: order.id, user_id: userId, merchant_id: merchantId },
      });

      // Store Razorpay order ID in payments table
      await client.query(
        `INSERT INTO payments (order_id, user_id, amount, payment_method, payment_status, razorpay_order_id)
         VALUES ($1, $2, $3, $4, 'pending', $5)`,
        [order.id, userId, payableAmount, payment_method, razorpayOrder.id]
      );

      return {
        order: { id: order.id, order_number: orderNumber, total_amount: totalAmount },
        payment: {
          method:            payment_method,
          payable:           payableAmount,
          wallet_applied:    walletDeduction,
          razorpay_order_id: razorpayOrder.id,
          key_id:            process.env.NODE_ENV === 'production'
            ? process.env.RAZORPAY_KEY_ID
            : process.env.RAZORPAY_TEST_KEY_ID,
        },
        message: 'Order created. Complete payment to confirm.',
      };
    });
  },

  // ════════════════════════════════════════════════════════════
  // STEP 2A: VERIFY RAZORPAY PAYMENT (after frontend checkout)
  // Moves order → payment_processed and notifies merchant
  // ════════════════════════════════════════════════════════════
  verifyPayment: async (userId, { order_id, razorpay_order_id, razorpay_payment_id, razorpay_signature }) => {
    return withTransaction(async (client) => {

      // Fetch order
      const { rows: orderRows } = await client.query(
        `SELECT o.*, p.id AS payment_record_id
         FROM orders o
         LEFT JOIN payments p ON p.order_id = o.id
         WHERE o.id = $1 AND o.user_id = $2`,
        [order_id, userId]
      );

      const order = orderRows[0];
      if (!order) throw Object.assign(new Error('Order not found'), { statusCode: 404 });
      if (order.order_status !== 'payment_pending') {
        throw Object.assign(new Error('Order is not awaiting payment'), { statusCode: 400 });
      }

      // Verify Razorpay signature
      const isValid = verifyPaymentSignature({
        razorpayOrderId:   razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature,
      });
      if (!isValid) {
        throw Object.assign(new Error('Payment verification failed. Invalid signature.'), { statusCode: 400 });
      }

      // Update payment record
      await client.query(
        `UPDATE payments
         SET razorpay_payment_id = $1,
             razorpay_signature  = $2,
             payment_status      = 'captured',
             captured_at         = NOW()
         WHERE order_id = $3`,
        [razorpay_payment_id, razorpay_signature, order_id]
      );

      // Advance order status → payment_processed
      await client.query(
        `UPDATE orders
         SET order_status          = 'payment_processed',
             payment_status        = 'captured',
             payment_processed_at  = NOW(),
             paid_at               = NOW(),
             updated_at            = NOW()
         WHERE id = $1`,
        [order_id]
      );

      await logStatusChange(
        client, order_id,
        'payment_pending', 'payment_processed',
        'customer', userId,
        `Razorpay payment ${razorpay_payment_id}`
      );

      // Clear cart
      await client.query(
        'DELETE FROM cart_items WHERE cart_id = (SELECT id FROM carts WHERE user_id = $1)',
        [userId]
      );
      await client.query('UPDATE carts SET merchant_id = NULL WHERE user_id = $1', [userId]);
      await redis.del(`mlb:cart_detail:${userId}`);

      // Notify merchant — this is the most urgent notification in the system
      notify(order.merchant_id, 'merchant', 'order',
        '🛒 New Paid Order!',
        `Order ${order.order_number} worth ₹${order.total_amount} needs your approval`,
        { order_id, order_number: order.order_number, total_amount: order.total_amount }
      );

      // Notify customer
      notify(userId, 'customer', 'order',
        '✅ Payment Successful!',
        `Your order ${order.order_number} has been placed. Waiting for merchant confirmation.`,
        { order_id, order_number: order.order_number }
      );

      logger.info('Payment verified', { orderId: order_id, razorpay_payment_id, userId });

      return {
        order_id,
        order_number:   order.order_number,
        order_status:   'payment_processed',
        payment_status: 'captured',
        message:        'Payment confirmed. Merchant is reviewing your order.',
      };
    });
  },

  // ════════════════════════════════════════════════════════════
  // STEP 3: MERCHANT ORDER ACTION (approve / reject)
  // ════════════════════════════════════════════════════════════
  merchantAction: async (merchantId, orderId, { action, rejection_reason, estimated_delivery_minutes }) => {
    return withTransaction(async (client) => {

      const { rows } = await client.query(
        `SELECT * FROM orders WHERE id = $1 AND merchant_id = $2 AND order_status = 'payment_processed'`,
        [orderId, merchantId]
      );

      const order = rows[0];
      if (!order) {
        throw Object.assign(
          new Error('Order not found or not awaiting your approval'),
          { statusCode: 404 }
        );
      }

      if (action === 'approve') {
        const expectedAt = estimated_delivery_minutes
          ? new Date(Date.now() + estimated_delivery_minutes * 60 * 1000)
          : null;

        await client.query(
          `UPDATE orders
           SET order_status         = 'merchant_approved',
               merchant_action_at   = NOW(),
               merchant_action_by   = $1,
               expected_delivery_at = $2,
               updated_at           = NOW()
           WHERE id = $3`,
          [merchantId, expectedAt, orderId]
        );

        await logStatusChange(client, orderId, 'payment_processed', 'merchant_approved', 'merchant', merchantId);

        notify(order.user_id, 'customer', 'order',
          '🎉 Order Approved!',
          `${order.order_number} has been approved! It will be prepared soon.`,
          { order_id: orderId, order_number: order.order_number }
        );

        return { order_status: 'merchant_approved', message: 'Order approved successfully' };

      } else {
        // REJECT — trigger refund for non-COD orders
        await client.query(
          `UPDATE orders
           SET order_status              = 'merchant_rejected',
               merchant_action_at        = NOW(),
               merchant_action_by        = $1,
               merchant_rejection_reason = $2,
               updated_at                = NOW()
           WHERE id = $3`,
          [merchantId, rejection_reason, orderId]
        );

        await logStatusChange(
          client, orderId,
          'payment_processed', 'merchant_rejected',
          'merchant', merchantId,
          rejection_reason
        );

        // Trigger automatic refund for online payments
        if (order.payment_method !== 'cod' && order.payment_status === 'captured') {
          await OrderService._triggerRefund(client, order, merchantId, 'merchant_rejected');
        }

        notify(order.user_id, 'customer', 'order',
          '❌ Order Cancelled',
          `${order.order_number} was rejected by the store. Reason: ${rejection_reason}. Refund will be processed.`,
          { order_id: orderId, order_number: order.order_number }
        );

        return { order_status: 'merchant_rejected', message: 'Order rejected and refund initiated' };
      }
    });
  },

  // ════════════════════════════════════════════════════════════
  // STEP 4–6: MERCHANT UPDATES ORDER LIFECYCLE STATUS
  // ════════════════════════════════════════════════════════════
  merchantUpdateStatus: async (merchantId, orderId, { status, note }) => {
    return withTransaction(async (client) => {

      const { rows } = await client.query(
        'SELECT * FROM orders WHERE id = $1 AND merchant_id = $2',
        [orderId, merchantId]
      );

      const order = rows[0];
      if (!order) throw Object.assign(new Error('Order not found'), { statusCode: 404 });

      // Allowed transitions
      const ALLOWED = {
        merchant_approved: ['accepted'],
        accepted:          ['packed'],
        packed:            ['out_for_delivery'],
        out_for_delivery:  ['delivered'],
      };

      if (!ALLOWED[order.order_status]?.includes(status)) {
        throw Object.assign(
          new Error(`Cannot move order from '${order.order_status}' to '${status}'`),
          { statusCode: 400 }
        );
      }

      const updates = { order_status: status };

      // Generate delivery OTP when moving to out_for_delivery
      if (status === 'out_for_delivery') {
        updates.delivery_otp = generateDeliveryOTP();
      }

      if (status === 'delivered') {
        updates.delivered_at              = new Date();
        updates.delivery_otp_verified     = true;
      }

      const setClauses = Object.entries(updates)
        .map(([k], i) => `${k} = $${i + 1}`)
        .join(', ');
      const values     = [...Object.values(updates), orderId];

      await client.query(
        `UPDATE orders SET ${setClauses}, updated_at = NOW() WHERE id = $${values.length}`,
        values
      );

      await logStatusChange(client, orderId, order.order_status, status, 'merchant', merchantId, note);

      // Notify customer
      const messages = {
        accepted:         `✅ ${order.order_number} accepted! Being prepared now.`,
        packed:           `📦 ${order.order_number} is packed and ready for pickup!`,
        out_for_delivery: `🚴 ${order.order_number} is on the way! OTP: ${updates.delivery_otp}`,
        delivered:        `✅ ${order.order_number} delivered successfully. Enjoy!`,
      };

      notify(order.user_id, 'customer', 'order',
        'Order Update',
        messages[status],
        { order_id: orderId, order_number: order.order_number, delivery_otp: updates.delivery_otp }
      );

      // For delivered: credit merchant wallet
      if (status === 'delivered') {
        await OrderService._settleToMerchantWallet(client, order);
      }

      return { order_status: status, delivery_otp: updates.delivery_otp || null };
    });
  },

  // ════════════════════════════════════════════════════════════
  // ADMIN OVERRIDE — override merchant decision
  // ════════════════════════════════════════════════════════════
  adminOverride: async (adminId, orderId, { target_status, note }) => {
    return withTransaction(async (client) => {
      const { rows } = await client.query(
        'SELECT * FROM orders WHERE id = $1', [orderId]
      );
      const order = rows[0];
      if (!order) throw Object.assign(new Error('Order not found'), { statusCode: 404 });

      await client.query(
        `UPDATE orders
         SET order_status       = $1,
             admin_override_at  = NOW(),
             admin_override_by  = $2,
             admin_override_note = $3,
             updated_at         = NOW()
         WHERE id = $4`,
        [target_status, adminId, note, orderId]
      );

      await logStatusChange(client, orderId, order.order_status, target_status, 'admin', adminId, note);

      if (target_status === 'refund_initiated') {
        await OrderService._triggerRefund(client, order, adminId, 'admin_override');
      }

      return { order_status: target_status };
    });
  },

  // ════════════════════════════════════════════════════════════
  // RETURN REQUEST
  // ════════════════════════════════════════════════════════════
  raiseReturn: async (userId, orderId, data) => {
    const { rows } = await query(
      `SELECT * FROM orders WHERE id = $1 AND user_id = $2 AND order_status = 'delivered'`,
      [orderId, userId]
    );
    const order = rows[0];
    if (!order) {
      throw Object.assign(
        new Error('Only delivered orders can be returned'),
        { statusCode: 400 }
      );
    }

    // Check return window
    const deliveredAt    = new Date(order.delivered_at);
    const returnWindowMs = 7 * 24 * 60 * 60 * 1000; // 7 days default
    if (Date.now() - deliveredAt.getTime() > returnWindowMs) {
      throw Object.assign(
        new Error('Return window has expired. Returns must be raised within 7 days of delivery.'),
        { statusCode: 400 }
      );
    }

    const { rows: returnRows } = await query(
      `INSERT INTO return_requests
         (order_id, user_id, merchant_id, reason, return_items, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')
       RETURNING id`,
      [orderId, userId, order.merchant_id, data.reason, JSON.stringify(data.return_items)]
    );

    await query(
      `UPDATE orders SET order_status = 'return_requested', updated_at = NOW() WHERE id = $1`,
      [orderId]
    );

    notify(order.merchant_id, 'merchant', 'order',
      '↩️ Return Request',
      `Customer raised a return for order ${order.order_number}`,
      { order_id: orderId }
    );

    return { return_id: returnRows[0].id, message: 'Return request submitted' };
  },

  // ════════════════════════════════════════════════════════════
  // FETCH ORDER (customer view)
  // ════════════════════════════════════════════════════════════
  getForCustomer: async (userId, orderId) => {
    const { rows } = await query(
      `SELECT o.*,
              m.store_name, m.store_slug, m.store_logo_url,
              u.full_name AS customer_name, u.phone AS customer_phone
       FROM orders o
       JOIN merchants m ON m.id = o.merchant_id
       JOIN users u     ON u.id = o.user_id
       WHERE o.id = $1 AND o.user_id = $2`,
      [orderId, userId]
    );
    if (!rows[0]) throw Object.assign(new Error('Order not found'), { statusCode: 404 });

    const order = rows[0];

    const [items, statusLogs] = await Promise.all([
      query(
        `SELECT oi.*, p.slug AS product_slug,
                (SELECT image_url FROM product_images pi WHERE pi.product_id = oi.product_id AND pi.is_primary LIMIT 1) AS image
         FROM order_items oi
         LEFT JOIN products p ON p.id = oi.product_id
         WHERE oi.order_id = $1`,
        [orderId]
      ),
      query(
        `SELECT from_status, to_status, changed_by_role, note, created_at
         FROM order_status_logs WHERE order_id = $1 ORDER BY created_at ASC`,
        [orderId]
      ),
    ]);

    return { ...order, items: items.rows, status_timeline: statusLogs.rows };
  },

  // List customer orders with filters
  listForCustomer: async (userId, filters = {}, pagination = {}) => {
    const { status, from_date, to_date, sort_by = 'created_at', sort_order = 'desc' } = filters;
    const { page = 1, limit = 10 } = pagination;
    const { queryPaginated } = require('../config/db');

    const params  = [userId];
    const clauses = ['o.user_id = $1'];
    if (status)    { params.push(status);    clauses.push(`o.order_status = $${params.length}`); }
    if (from_date) { params.push(from_date); clauses.push(`o.created_at >= $${params.length}`); }
    if (to_date)   { params.push(to_date);   clauses.push(`o.created_at <= $${params.length}`); }

    const sortCols  = { created_at: 'o.created_at', total_amount: 'o.total_amount' };
    const safeSort  = sortCols[sort_by] || 'o.created_at';
    const safeOrder = sort_order === 'asc' ? 'ASC' : 'DESC';

    return queryPaginated(
      `SELECT o.id, o.order_number, o.order_status, o.payment_status, o.payment_method,
              o.total_amount, o.delivery_charge, o.discount_amount,
              o.created_at, o.delivered_at, o.merchant_rejection_reason,
              m.store_name, m.store_logo_url, m.store_slug,
              (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id)::int AS item_count,
              (SELECT image_url FROM product_images pi
               JOIN order_items oi2 ON oi2.product_id = pi.product_id
               WHERE oi2.order_id = o.id AND pi.is_primary = true LIMIT 1) AS preview_image
       FROM orders o
       JOIN merchants m ON m.id = o.merchant_id
       WHERE ${clauses.join(' AND ')}
       ORDER BY ${safeSort} ${safeOrder}`,
      params,
      { page, limit }
    );
  },

  // ════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ════════════════════════════════════════════════════════════

  _triggerRefund: async (client, order, actorId, reason) => {
    try {
      // Fetch Razorpay payment ID
      const { rows: payRows } = await client.query(
        `SELECT razorpay_payment_id, amount FROM payments WHERE order_id = $1 AND payment_status = 'captured'`,
        [order.id]
      );

      if (payRows[0]?.razorpay_payment_id) {
        const refund = await initiateRefund({
          paymentId: payRows[0].razorpay_payment_id,
          amount:    parseFloat(payRows[0].amount),
          notes:     { order_id: order.id, reason },
        });

        await client.query(
          `UPDATE payments
           SET payment_status = 'refunded', refunded_at = NOW(),
               refund_amount = $1, refund_reference_id = $2
           WHERE order_id = $3`,
          [payRows[0].amount, refund.id, order.id]
        );
      }

      // Wallet orders — credit back
      if (order.payment_method === 'wallet') {
        await client.query(
          `UPDATE wallets
           SET balance       = balance + $1,
               total_credited = total_credited + $1,
               updated_at    = NOW()
           WHERE owner_id = $2 AND owner_type = 'customer'`,
          [order.total_amount, order.user_id]
        );
      }

      await client.query(
        `UPDATE orders SET order_status = 'refund_initiated', updated_at = NOW() WHERE id = $1`,
        [order.id]
      );

    } catch (err) {
      logger.error('Refund trigger failed:', { orderId: order.id, error: err.message });
      // Don't rethrow — refund can be manually processed by admin
    }
  },

  _settleToMerchantWallet: async (client, order) => {
    try {
      const commission = parseFloat(process.env.PLATFORM_COMMISSION_PERCENT || 8) / 100;
      const gross      = parseFloat(order.total_amount) - parseFloat(order.delivery_charge);
      const platformFee = parseFloat((gross * commission).toFixed(2));
      const netPayable  = parseFloat((gross - platformFee).toFixed(2));

      await client.query(
        `UPDATE wallets
         SET balance       = balance + $1,
             locked_balance = GREATEST(0, locked_balance - $1),
             total_credited = total_credited + $1,
             updated_at    = NOW()
         WHERE owner_id = $2 AND owner_type = 'merchant'`,
        [netPayable, order.merchant_id]
      );

      await client.query(
        `INSERT INTO wallet_transactions
           (wallet_id, transaction_type, amount, closing_balance, reference_type, reference_id, description)
         SELECT w.id, 'credit', $1, w.balance + $1, 'order', $2, 'Order settlement'
         FROM wallets w WHERE w.owner_id = $3 AND w.owner_type = 'merchant'`,
        [netPayable, order.id, order.merchant_id]
      );
    } catch (err) {
      logger.error('Merchant wallet settlement failed:', { orderId: order.id, error: err.message });
    }
  },
};

module.exports = OrderService;
