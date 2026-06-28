// src/controllers/payment/razorpay.controller.js
// ─────────────────────────────────────────────────────────────
// Razorpay Webhook Controller — MyLocalBazaar.store
//
// Handles server-side Razorpay events:
//   payment.captured     → advance order to payment_processed
//   payment.failed       → mark payment failed, notify customer
//   refund.processed     → mark refund complete, notify customer
//   order.paid           → backup capture handler
//
// Webhook URL: POST /api/v1/payments/webhook/razorpay
// Register this URL in your Razorpay Dashboard → Settings → Webhooks
// ─────────────────────────────────────────────────────────────

const { verifyWebhookSignature } = require('../../config/razorpay');
const { query, withTransaction } = require('../../config/db');
const logger = require('../../config/logger');

// Helper: insert notification
const notify = async (recipientId, recipientType, type, title, body, data = {}) => {
  try {
    await query(
      `INSERT INTO notifications (recipient_id, recipient_type, notification_type, title, body, data)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [recipientId, recipientType, type, title, body, JSON.stringify(data)]
    );
  } catch (err) {
    logger.warn('Webhook notification failed:', { message: err.message });
  }
};

// ── POST /payments/webhook/razorpay ───────────────────────────
// Express must be configured with raw body for this route (see route file)
const razorpayWebhook = async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];

  // 1) Verify signature FIRST — reject forged/tampered calls before any DB work
  if (!verifyWebhookSignature(req.rawBody, signature)) {
    logger.warn('Razorpay webhook: invalid signature', { signature });
    return res.status(400).json({ received: false, error: 'invalid_signature' });
  }

  try {
    const event   = req.body.event;
    const payload = req.body.payload;

    logger.info('Razorpay webhook received', { event });

    switch (event) {

      // ── payment.captured ──────────────────────────────────
      // Primary trigger for advancing order to payment_processed
      case 'payment.captured': {
        const payment     = payload.payment?.entity;
        const rzpOrderId  = payment?.order_id;
        if (!rzpOrderId) break;

        const { rows: payRows } = await query(
          `SELECT p.*, o.id AS order_id, o.user_id, o.merchant_id,
                  o.order_number, o.total_amount, o.order_status
           FROM payments p
           JOIN orders o ON o.id = p.order_id
           WHERE p.razorpay_order_id = $1`,
          [rzpOrderId]
        );

        const payRecord = payRows[0];
        if (!payRecord || payRecord.order_status !== 'payment_pending') break;

        await withTransaction(async (client) => {
          await client.query(
            `UPDATE payments
             SET razorpay_payment_id = $1,
                 payment_status      = 'captured',
                 captured_at         = NOW(),
                 gateway_response    = $2
             WHERE razorpay_order_id = $3`,
            [payment.id, JSON.stringify(payment), rzpOrderId]
          );

          await client.query(
            `UPDATE orders
             SET order_status          = 'payment_processed',
                 payment_status        = 'captured',
                 payment_processed_at  = NOW(),
                 paid_at               = NOW(),
                 updated_at            = NOW()
             WHERE id = $1 AND order_status = 'payment_pending'`,
            [payRecord.order_id]
          );

          await client.query(
            `INSERT INTO order_status_logs
               (order_id, from_status, to_status, changed_by_role, changed_by_id, note)
             VALUES ($1, 'payment_pending', 'payment_processed', 'customer', $2, $3)`,
            [payRecord.order_id, payRecord.user_id, `Razorpay webhook: ${payment.id}`]
          );

          // Clear cart
          await client.query(
            'DELETE FROM cart_items WHERE cart_id = (SELECT id FROM carts WHERE user_id = $1)',
            [payRecord.user_id]
          );
          await client.query(
            'UPDATE carts SET merchant_id = NULL WHERE user_id = $1',
            [payRecord.user_id]
          );

          const { redis } = require('../../config/redis');
          await redis.del(`mlb:cart_detail:${payRecord.user_id}`);
        });

        // Notify merchant
        notify(payRecord.merchant_id, 'merchant', 'order',
          '🛒 New Order Awaiting Approval!',
          `Order ${payRecord.order_number} for ₹${payRecord.total_amount} needs your approval`,
          { order_id: payRecord.order_id, order_number: payRecord.order_number }
        );

        // Notify customer
        notify(payRecord.user_id, 'customer', 'payment',
          '✅ Payment Successful!',
          `₹${payRecord.total_amount} received for order ${payRecord.order_number}`,
          { order_id: payRecord.order_id }
        );

        logger.info('Webhook: payment captured & order advanced', {
          orderId:   payRecord.order_id,
          paymentId: payment.id,
        });
        break;
      }

      // ── payment.failed ────────────────────────────────────
      case 'payment.failed': {
        const payment    = payload.payment?.entity;
        const rzpOrderId = payment?.order_id;
        if (!rzpOrderId) break;

        const { rows: payRows } = await query(
          `SELECT p.*, o.user_id, o.order_number, o.id AS order_id
           FROM payments p JOIN orders o ON o.id = p.order_id
           WHERE p.razorpay_order_id = $1`,
          [rzpOrderId]
        );

        if (!payRows[0]) break;

        await query(
          `UPDATE payments
           SET payment_status   = 'failed',
               failure_reason   = $1,
               gateway_response = $2
           WHERE razorpay_order_id = $3`,
          [payment.error_description, JSON.stringify(payment), rzpOrderId]
        );

        notify(payRows[0].user_id, 'customer', 'payment',
          '❌ Payment Failed',
          `Payment for order ${payRows[0].order_number} failed. Please try again.`,
          { order_id: payRows[0].order_id, reason: payment.error_description }
        );

        logger.warn('Webhook: payment failed', { orderId: payRows[0].order_id, error: payment.error_description });
        break;
      }

      // ── refund.processed ──────────────────────────────────
      case 'refund.processed': {
        const refund     = payload.refund?.entity;
        const paymentId  = refund?.payment_id;
        if (!paymentId) break;

        const { rows: payRows } = await query(
          `SELECT p.*, o.user_id, o.order_number, o.id AS order_id, o.total_amount
           FROM payments p JOIN orders o ON o.id = p.order_id
           WHERE p.razorpay_payment_id = $1`,
          [paymentId]
        );

        if (!payRows[0]) break;
        // Idempotency: ignore duplicate refund webhooks (Razorpay may retry on non-2xx)
        if (payRows[0].payment_status === 'refunded') {
          logger.info('Webhook: refund already processed, skipping', { paymentId });
          break;
        }

        await query(
          `UPDATE payments
           SET payment_status     = 'refunded',
               refunded_at        = NOW(),
               refund_amount      = $1,
               refund_reference_id = $2
           WHERE razorpay_payment_id = $3`,
          [refund.amount / 100, refund.id, paymentId]
        );

        await query(
          `UPDATE orders SET order_status = 'refund_completed', updated_at = NOW()
           WHERE id = $1`,
          [payRows[0].order_id]
        );

        notify(payRows[0].user_id, 'customer', 'payment',
          '💰 Refund Processed!',
          `₹${refund.amount / 100} refunded for order ${payRows[0].order_number}. It will appear in 5–7 business days.`,
          { order_id: payRows[0].order_id, refund_amount: refund.amount / 100 }
        );

        logger.info('Webhook: refund processed', {
          orderId:   payRows[0].order_id,
          refundId:  refund.id,
          amount:    refund.amount / 100,
        });
        break;
      }

      default:
        logger.debug('Unhandled Razorpay event', { event });
    }

    // Processed OK → acknowledge so Razorpay stops retrying
    return res.status(200).json({ received: true });
  } catch (err) {
    logger.error('Razorpay webhook processing error:', { message: err.message, stack: err.stack });
    // Non-2xx → Razorpay will retry later. The idempotency guards above make retries safe.
    return res.status(500).json({ received: false });
  }
};

module.exports = { razorpayWebhook };
