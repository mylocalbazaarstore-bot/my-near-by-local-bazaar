// src/routes/appointment.routes.js
// Public service discovery plus authenticated booking/slot management.

const express = require('express');
const { authenticate, authorize, optionalAuth } = require('../middlewares/auth.middleware');
const { validate } = require('../middlewares/validate.middleware');
const ctrl = require('../controllers/appointment.controller');
const V = require('../validators/appointment.validator');

const servicesRouter = express.Router();
const providersRouter = express.Router();
const slotsRouter = express.Router();
const bookingsRouter = express.Router();

// Services: public discovery, merchant management.
servicesRouter.get('/categories', ctrl.listCategories);
servicesRouter.get('/', validate(V.listServices, 'query'), ctrl.listServices);
servicesRouter.post('/', authenticate, authorize('merchant'), validate(V.createService), ctrl.createService);
servicesRouter.get('/:id', validate(V.idParam, 'params'), ctrl.getService);
servicesRouter.patch('/:id',
  authenticate,
  authorize('merchant'),
  validate(V.idParam, 'params'),
  validate(V.updateService),
  ctrl.updateService
);

// Providers: public discovery, merchant management.
providersRouter.get('/', optionalAuth, validate(V.listProviders, 'query'), ctrl.listProviders);
providersRouter.post('/', authenticate, authorize('merchant'), validate(V.createProvider), ctrl.createProvider);
providersRouter.get('/:id', validate(V.idParam, 'params'), ctrl.getProvider);
providersRouter.patch('/:id',
  authenticate,
  authorize('merchant'),
  validate(V.idParam, 'params'),
  validate(V.updateProvider),
  ctrl.updateProvider
);

// Slots: public availability lookup, merchant slot CRUD.
slotsRouter.get('/', validate(V.listSlots, 'query'), ctrl.listSlots);
slotsRouter.post('/', authenticate, authorize('merchant'), validate(V.createSlot), ctrl.createSlot);
slotsRouter.patch('/:id',
  authenticate,
  authorize('merchant'),
  validate(V.idParam, 'params'),
  validate(V.updateSlot),
  ctrl.updateSlot
);
slotsRouter.delete('/:id',
  authenticate,
  authorize('merchant'),
  validate(V.idParam, 'params'),
  ctrl.deleteSlot
);

// Bookings: customer creates/views own bookings; merchant manages own bookings.
bookingsRouter.post('/', authenticate, authorize('customer'), validate(V.createBooking), ctrl.createBooking);
bookingsRouter.get('/merchant',
  authenticate,
  authorize('merchant'),
  validate(V.bookingList, 'query'),
  ctrl.listMerchantBookings
);
bookingsRouter.get('/customer/:customerId',
  authenticate,
  authorize('customer', 'admin'),
  validate(V.customerParam, 'params'),
  validate(V.bookingList, 'query'),
  ctrl.listCustomerBookings
);
bookingsRouter.get('/:id',
  authenticate,
  authorize('customer', 'merchant', 'admin'),
  validate(V.idParam, 'params'),
  ctrl.getBooking
);
bookingsRouter.patch('/:id/status',
  authenticate,
  authorize('customer', 'merchant', 'admin'),
  validate(V.idParam, 'params'),
  validate(V.updateBookingStatus),
  ctrl.updateBookingStatus
);

module.exports = {
  servicesRouter,
  providersRouter,
  slotsRouter,
  bookingsRouter,
};
