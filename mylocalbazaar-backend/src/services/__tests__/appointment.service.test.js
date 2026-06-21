const mockDb = {
  query: jest.fn(),
  queryPaginated: jest.fn(),
  withTransaction: jest.fn(),
};

jest.mock('../../config/db', () => mockDb);
jest.mock('../../utils/generators', () => ({
  generateBookingNumber: () => 'MLB-BK-2026-TEST',
}));
jest.mock('../../middlewares/error.middleware', () => ({
  AppError: class AppError extends Error {
    constructor(message, statusCode = 500, code = null) {
      super(message);
      this.statusCode = statusCode;
      this.code = code;
    }
  },
}));

const AppointmentService = require('../appointment.service');

const bookingRow = (overrides = {}) => ({
  id: 'booking-1',
  merchant_id: 'merchant-1',
  user_id: 'customer-1',
  booking_status: 'pending',
  slot_id: 'slot-1',
  is_future: true,
  ...overrides,
});

describe('AppointmentService', () => {
  let client;

  beforeEach(() => {
    client = { query: jest.fn() };
    mockDb.query.mockReset();
    mockDb.queryPaginated.mockReset();
    mockDb.withTransaction.mockReset();
    mockDb.withTransaction.mockImplementation((callback) => callback(client));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('creates a booking and marks the slot as booked', async () => {
    client.query
      .mockResolvedValueOnce({
        rows: [{
          id: 'service-1',
          merchant_id: 'merchant-1',
          provider_id: null,
          category_slug: 'doctor-booking',
          merchant_status: 'active',
          merchant_active: true,
          is_home_visit: false,
          price: '500.00',
          final_price: '450.00',
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          id: 'slot-1',
          provider_id: 'provider-1',
          service_id: null,
          provider_merchant_id: 'merchant-1',
          service_category: 'doctor',
          provider_available: true,
          slot_date: '2099-01-01',
          start_time: '10:00:00',
          end_time: '10:30:00',
          is_booked: false,
          is_blocked: false,
        }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'booking-1' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          id: 'booking-1',
          booking_number: 'MLB-BK-2026-TEST',
          customer_id: 'customer-1',
          status: 'pending',
        }],
      });

    const booking = await AppointmentService.createBooking('customer-1', {
      service_id: 'service-1',
      slot_id: 'slot-1',
      customer_name: 'Test User',
      customer_mobile: '9876543210',
      payment_method: 'pay_at_shop',
    });

    expect(booking.booking_number).toBe('MLB-BK-2026-TEST');
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE service_slots'),
      ['slot-1', 'service-1']
    );
  });

  it('rejects an already booked slot with a clean conflict', async () => {
    client.query
      .mockResolvedValueOnce({
        rows: [{
          id: 'service-1',
          merchant_id: 'merchant-1',
          provider_id: null,
          category_slug: 'doctor-booking',
          merchant_status: 'active',
          merchant_active: true,
          is_home_visit: false,
          price: '500.00',
          final_price: '500.00',
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          id: 'slot-1',
          provider_id: 'provider-1',
          provider_merchant_id: 'merchant-1',
          service_category: 'doctor',
          provider_available: true,
          slot_date: '2099-01-01',
          start_time: '10:00:00',
          end_time: '10:30:00',
          is_booked: true,
          is_blocked: false,
        }],
      });

    await expect(AppointmentService.createBooking('customer-1', {
      service_id: 'service-1',
      slot_id: 'slot-1',
      customer_name: 'Test User',
      customer_mobile: '9876543210',
      payment_method: 'pay_at_shop',
    })).rejects.toMatchObject({
      statusCode: 409,
      code: 'SLOT_ALREADY_BOOKED',
    });
  });

  it('rejects a slot shorter than the selected service duration', async () => {
    client.query
      .mockResolvedValueOnce({
        rows: [{
          id: 'service-1',
          merchant_id: 'merchant-1',
          provider_id: null,
          category_slug: 'doctor-booking',
          merchant_status: 'active',
          merchant_active: true,
          is_home_visit: false,
          duration_minutes: 45,
          price: '500.00',
          final_price: '500.00',
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          id: 'slot-1',
          provider_id: 'provider-1',
          provider_merchant_id: 'merchant-1',
          service_category: 'doctor',
          provider_available: true,
          slot_date: '2099-01-01',
          start_time: '10:00:00',
          end_time: '10:30:00',
          is_booked: false,
          is_blocked: false,
        }],
      });

    await expect(AppointmentService.createBooking('customer-1', {
      service_id: 'service-1',
      slot_id: 'slot-1',
      customer_name: 'Test User',
      customer_mobile: '9876543210',
      payment_method: 'pay_at_shop',
    })).rejects.toMatchObject({
      statusCode: 400,
      code: 'SLOT_TOO_SHORT',
    });
  });

  it('prevents a merchant from updating another merchant booking', async () => {
    client.query.mockResolvedValueOnce({
      rows: [{
        id: 'booking-1',
        merchant_id: 'merchant-1',
        user_id: 'customer-1',
        booking_status: 'pending',
        is_future: true,
      }],
    });

    await expect(AppointmentService.updateBookingStatus(
      'booking-1',
      { id: 'merchant-2', role: 'merchant' },
      { status: 'confirmed' }
    )).rejects.toMatchObject({
      statusCode: 403,
      code: 'BOOKING_FORBIDDEN',
    });
  });

  it('forces public provider listings to active providers even when include_inactive is requested', async () => {
    mockDb.queryPaginated.mockResolvedValue({
      rows: [],
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 0,
    });

    await AppointmentService.listProviders({ include_inactive: true }, {}, null);

    expect(mockDb.queryPaginated).toHaveBeenCalledWith(
      expect.stringContaining('sp.is_available = true'),
      [],
      {}
    );
  });

  it('scopes merchant inactive provider listings to the authenticated merchant', async () => {
    mockDb.queryPaginated.mockResolvedValue({
      rows: [],
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 0,
    });

    await AppointmentService.listProviders(
      { include_inactive: true, merchant_id: 'merchant-2' },
      {},
      { id: 'merchant-1', role: 'merchant' }
    );

    const [sql, params] = mockDb.queryPaginated.mock.calls[0];
    expect(sql).not.toContain('sp.is_available = true');
    expect(params).toEqual(['merchant-1']);
  });

  it('rejects service creation when provider category does not match service category', async () => {
    client.query
      .mockResolvedValueOnce({
        rows: [{
          id: 'provider-1',
          merchant_id: 'merchant-1',
          service_category: 'doctor',
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          id: 'category-1',
          slug: 'mens-salon',
        }],
      });

    await expect(AppointmentService.createService('merchant-1', {
      provider_id: 'provider-1',
      category_id: 'category-1',
      name: 'Haircut',
      duration_minutes: 30,
      price: 100,
      is_home_visit: false,
      is_active: true,
    })).rejects.toMatchObject({
      statusCode: 400,
      code: 'SERVICE_PROVIDER_CATEGORY_MISMATCH',
    });

    expect(client.query).toHaveBeenCalledTimes(2);
  });

  it('rejects slot creation when selected service is incompatible with the provider', async () => {
    client.query
      .mockResolvedValueOnce({
        rows: [{
          id: 'provider-1',
          merchant_id: 'merchant-1',
          service_category: 'doctor',
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          id: 'service-1',
          merchant_id: 'merchant-1',
          provider_id: null,
          category_slug: 'mens-salon',
          duration_minutes: 30,
        }],
      });

    await expect(AppointmentService.createSlot('merchant-1', {
      provider_id: 'provider-1',
      service_id: 'service-1',
      slot_date: '2099-01-01',
      start_time: '10:00',
      end_time: '10:30',
      is_blocked: false,
    })).rejects.toMatchObject({
      statusCode: 400,
      code: 'SERVICE_PROVIDER_CATEGORY_MISMATCH',
    });
  });

  it('soft-deactivates a slot when booking history references it', async () => {
    client.query
      .mockResolvedValueOnce({
        rows: [{
          id: 'slot-1',
          provider_id: 'provider-1',
          is_active: true,
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          id: 'booking-1',
          booking_status: 'completed',
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          id: 'slot-1',
          is_active: false,
          is_blocked: true,
        }],
      });

    const result = await AppointmentService.deleteSlot('merchant-1', 'slot-1');

    expect(result).toMatchObject({ deleted: false, deactivated: true });
    expect(client.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('SET is_active = false'),
      ['slot-1']
    );
  });

  it('returns a clean conflict when slot update hits a duplicate active slot', async () => {
    client.query
      .mockResolvedValueOnce({
        rows: [{
          id: 'slot-1',
          provider_id: 'provider-1',
          service_id: null,
          service_category: 'doctor',
          slot_date: '2099-01-01',
          start_time: '10:00:00',
          end_time: '10:30:00',
          is_active: true,
        }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(Object.assign(new Error('duplicate'), { code: '23505' }));

    await expect(AppointmentService.updateSlot('merchant-1', 'slot-1', {
      start_time: '11:00',
      end_time: '11:30',
    })).rejects.toMatchObject({
      statusCode: 409,
      code: 'SLOT_CONFLICT',
    });
  });

  it('uses app-local date and time parameters when listing same-day slots', async () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 0, 1, 4, 30, 0));
    mockDb.query.mockResolvedValue({ rows: [] });

    await AppointmentService.listSlots({
      providerId: 'provider-1',
      serviceId: 'service-1',
      date: '2026-01-01',
    });

    const [sql, params] = mockDb.query.mock.calls[0];
    expect(sql).not.toContain('CURRENT_DATE');
    expect(sql).not.toContain('CURRENT_TIME');
    expect(params).toEqual([
      'provider-1',
      '2026-01-01',
      'service-1',
      ['pending', 'confirmed', 'in_progress'],
      '2026-01-01',
      '10:00:00',
    ]);
    nowSpy.mockRestore();
  });

  it('allows a merchant to confirm a pending booking', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [bookingRow()] })
      .mockResolvedValueOnce({ rows: [{ id: 'booking-1', slot_id: 'slot-1' }] })
      .mockResolvedValueOnce({
        rows: [{
          id: 'booking-1',
          booking_number: 'MLB-BK-2026-TEST',
          status: 'confirmed',
        }],
      });

    const booking = await AppointmentService.updateBookingStatus(
      'booking-1',
      { id: 'merchant-1', role: 'merchant' },
      { status: 'confirmed' }
    );

    expect(booking.status).toBe('confirmed');
    expect(client.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('UPDATE bookings'),
      ['confirmed', null, 'merchant', 'booking-1']
    );
  });

  it('blocks terminal bookings from changing back to active statuses', async () => {
    client.query.mockResolvedValueOnce({
      rows: [bookingRow({ booking_status: 'rejected' })],
    });

    await expect(AppointmentService.updateBookingStatus(
      'booking-1',
      { id: 'merchant-1', role: 'merchant' },
      { status: 'confirmed' }
    )).rejects.toMatchObject({
      statusCode: 400,
      code: 'BOOKING_TERMINAL',
    });

    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it('prevents customers from completing bookings', async () => {
    client.query.mockResolvedValueOnce({
      rows: [bookingRow({ booking_status: 'confirmed' })],
    });

    await expect(AppointmentService.updateBookingStatus(
      'booking-1',
      { id: 'customer-1', role: 'customer' },
      { status: 'completed' }
    )).rejects.toMatchObject({
      statusCode: 403,
      code: 'BOOKING_STATUS_FORBIDDEN',
    });

    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it('releases the slot when a pending booking is rejected', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [bookingRow()] })
      .mockResolvedValueOnce({ rows: [{ id: 'booking-1', slot_id: 'slot-1' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          id: 'booking-1',
          booking_number: 'MLB-BK-2026-TEST',
          status: 'rejected',
        }],
      });

    const booking = await AppointmentService.updateBookingStatus(
      'booking-1',
      { id: 'merchant-1', role: 'merchant' },
      { status: 'rejected', reason: 'Provider unavailable' }
    );

    expect(booking.status).toBe('rejected');
    expect(client.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('UPDATE service_slots'),
      ['slot-1']
    );
  });
});
