// src/controllers/appointment.controller.js
// HTTP layer for service appointment booking APIs.

const AppointmentService = require('../services/appointment.service');
const { success, created, paginated } = require('../utils/response');

const listCategories = async (_req, res) => {
  const categories = await AppointmentService.listCategories();
  return success(res, { categories }, 'Service categories fetched');
};

const listServices = async (req, res) => {
  const { page, limit, ...filters } = req.query;
  const result = await AppointmentService.listServices(filters, { page, limit });
  return paginated(res, result, 'Services fetched');
};

const getService = async (req, res) => {
  const service = await AppointmentService.getService(req.params.id);
  return success(res, { service }, 'Service fetched');
};

const createService = async (req, res) => {
  const service = await AppointmentService.createService(req.user.id, req.body);
  return created(res, { service }, 'Service created');
};

const updateService = async (req, res) => {
  const service = await AppointmentService.updateService(req.user.id, req.params.id, req.body);
  return success(res, { service }, 'Service updated');
};

const listProviders = async (req, res) => {
  const { page, limit, ...filters } = req.query;
  const result = await AppointmentService.listProviders(filters, { page, limit }, req.user || null);
  return paginated(res, result, 'Providers fetched');
};

const getProvider = async (req, res) => {
  const provider = await AppointmentService.getProvider(req.params.id);
  return success(res, { provider }, 'Provider fetched');
};

const createProvider = async (req, res) => {
  const provider = await AppointmentService.createProvider(req.user.id, req.body);
  return created(res, { provider }, 'Provider created');
};

const updateProvider = async (req, res) => {
  const provider = await AppointmentService.updateProvider(req.user.id, req.params.id, req.body);
  return success(res, { provider }, 'Provider updated');
};

const listSlots = async (req, res) => {
  const slots = await AppointmentService.listSlots(req.query);
  return success(res, { slots }, 'Slots fetched');
};

const createSlot = async (req, res) => {
  const slot = await AppointmentService.createSlot(req.user.id, req.body);
  return created(res, { slot }, 'Slot created');
};

const updateSlot = async (req, res) => {
  const slot = await AppointmentService.updateSlot(req.user.id, req.params.id, req.body);
  return success(res, { slot }, 'Slot updated');
};

const deleteSlot = async (req, res) => {
  const result = await AppointmentService.deleteSlot(req.user.id, req.params.id);
  return success(
    res,
    { result },
    result.deactivated ? 'Slot deactivated because booking history exists' : 'Slot deleted'
  );
};

const createBooking = async (req, res) => {
  const booking = await AppointmentService.createBooking(req.user.id, req.body);
  return created(res, { booking }, 'Booking created');
};

const getBooking = async (req, res) => {
  const booking = await AppointmentService.getBookingForActor(req.params.id, req.user);
  return success(res, { booking }, 'Booking fetched');
};

const listCustomerBookings = async (req, res) => {
  const { page, limit, ...filters } = req.query;
  const result = await AppointmentService.listCustomerBookings(
    req.params.customerId,
    req.user,
    filters,
    { page, limit }
  );
  return paginated(res, result, 'Customer bookings fetched');
};

const listMerchantBookings = async (req, res) => {
  const { page, limit, ...filters } = req.query;
  const result = await AppointmentService.listMerchantBookings(
    req.user.id,
    filters,
    { page, limit }
  );
  return paginated(res, result, 'Merchant bookings fetched');
};

const updateBookingStatus = async (req, res) => {
  const booking = await AppointmentService.updateBookingStatus(req.params.id, req.user, req.body);
  return success(res, { booking }, 'Booking status updated');
};

module.exports = {
  listCategories,
  listServices,
  getService,
  createService,
  updateService,
  listProviders,
  getProvider,
  createProvider,
  updateProvider,
  listSlots,
  createSlot,
  updateSlot,
  deleteSlot,
  createBooking,
  getBooking,
  listCustomerBookings,
  listMerchantBookings,
  updateBookingStatus,
};
