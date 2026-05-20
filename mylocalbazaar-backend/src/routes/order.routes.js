// src/routes/order.routes.js
// ─────────────────────────────────────────────────────────────
// Order Routes — MyLocalBazaar.store
// Customer orders: /api/v1/orders/*
// Merchant orders: /api/v1/merchant/orders/*
// ─────────────────────────────────────────────────────────────

const express   = require('express');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const { validate }                = require('../middlewares/validate.middleware');
const V         = require('../validators/cart.validator');

const customerOrderCtrl = require('../controllers/customer/order.controller');
const merchantOrderCtrl = require('../controllers/merchant/order.controller');

// ── Customer order router ──────────────────────────────────────
const customerOrderRouter = express.Router();
customerOrderRouter.use(authenticate, authorize('customer'));

// 'verify' and specific action routes BEFORE '/:id'
customerOrderRouter.post('/verify',         validate(V.verifyPayment), customerOrderCtrl.verifyPayment);
customerOrderRouter.post('/',               validate(V.placeOrder),    customerOrderCtrl.placeOrder);
customerOrderRouter.get('/',                validate(V.orderListQuery, 'query'), customerOrderCtrl.listOrders);
customerOrderRouter.get('/:id',                                         customerOrderCtrl.getOrder);
customerOrderRouter.post('/:id/return',     validate(V.returnRequest), customerOrderCtrl.raiseReturn);
customerOrderRouter.post('/:id/cancel',                                 customerOrderCtrl.cancelOrder);

// ── Merchant order router ─────────────────────────────────────
const merchantOrderRouter = express.Router();
merchantOrderRouter.use(authenticate, authorize('merchant'));

// 'pending' and 'returns' BEFORE '/:id'
merchantOrderRouter.get('/pending',                                     merchantOrderCtrl.getPending);
merchantOrderRouter.get('/returns',                                     merchantOrderCtrl.getReturnRequests);
merchantOrderRouter.get('/',        validate(V.orderListQuery, 'query'),merchantOrderCtrl.listOrders);
merchantOrderRouter.get('/:id',                                         merchantOrderCtrl.getOrder);
merchantOrderRouter.post('/:id/action',   validate(V.merchantOrderAction),  merchantOrderCtrl.orderAction);
merchantOrderRouter.patch('/:id/status',  validate(V.merchantUpdateStatus), merchantOrderCtrl.updateStatus);
merchantOrderRouter.patch('/returns/:rid',                              merchantOrderCtrl.respondToReturn);

module.exports = { customerOrderRouter, merchantOrderRouter };
