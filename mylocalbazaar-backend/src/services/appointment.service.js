// src/services/appointment.service.js
// Service marketplace appointments: services, providers, slots, bookings.

const { query, withTransaction, queryPaginated } = require('../config/db');
const { generateBookingNumber } = require('../utils/generators');
const { AppError } = require('../middlewares/error.middleware');

const ACTIVE_BOOKING_STATUSES = ['pending', 'confirmed', 'in_progress'];
const TERMINAL_BOOKING_STATUSES = ['cancelled', 'rejected', 'completed', 'no_show'];
const BOOKING_STATUS_TRANSITIONS = {
  pending: ['confirmed', 'cancelled', 'rejected'],
  confirmed: ['completed', 'cancelled', 'no_show'],
  cancelled: [],
  rejected: [],
  completed: [],
  no_show: [],
};
const SERVICE_CATEGORY_BY_SLUG = {
  doctor: 'doctor',
  'doctor-booking': 'doctor',
  mens_salon: 'mens_salon',
  'mens-salon': 'mens_salon',
  womens_salon: 'womens_salon',
  'womens-salon': 'womens_salon',
  home_services: 'home_services',
  'home-services': 'home_services',
};

const CATEGORY_SLUG_BY_SERVICE_CATEGORY = {
  doctor: 'doctor-booking',
  mens_salon: 'mens-salon',
  womens_salon: 'womens-salon',
  home_services: 'home-services',
};
const APP_TIMEZONE_OFFSET_MINUTES = parseInt(process.env.APP_TIMEZONE_OFFSET_MINUTES || '330', 10);
const APP_TIMEZONE_OFFSET = Number.isFinite(APP_TIMEZONE_OFFSET_MINUTES)
  ? APP_TIMEZONE_OFFSET_MINUTES
  : 330;

const toServiceCategory = (value) => {
  if (!value) return null;
  const category = SERVICE_CATEGORY_BY_SLUG[String(value).trim()];
  if (!category) throw new AppError('Unsupported service category', 400, 'INVALID_SERVICE_CATEGORY');
  return category;
};

const toCategorySlug = (value) => {
  if (!value) return null;
  const serviceCategory = toServiceCategory(value);
  return CATEGORY_SLUG_BY_SERVICE_CATEGORY[serviceCategory] || null;
};

const normalizeTime = (value) => String(value || '').slice(0, 8);
const dateKey = (value) => (value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10));
const isSameUuid = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();
const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

const appClock = () => {
  const shifted = new Date(Date.now() + APP_TIMEZONE_OFFSET * 60 * 1000);
  return {
    today: shifted.toISOString().slice(0, 10),
    currentTime: shifted.toISOString().slice(11, 19),
  };
};

const minutes = (timeValue) => {
  const [hh, mm] = normalizeTime(timeValue).split(':').map((n) => parseInt(n, 10));
  return hh * 60 + mm;
};

const durationMinutes = (start, end) => minutes(end) - minutes(start);

const assertTimeRange = (start, end) => {
  if (durationMinutes(start, end) <= 0) {
    throw new AppError('Slot end time must be after start time', 400, 'INVALID_SLOT_TIME');
  }
};

const assertSlotDurationFitsService = (slot, service) => {
  const serviceDuration = Number(service.duration_minutes || 0);
  if (serviceDuration > 0 && durationMinutes(slot.start_time, slot.end_time) < serviceDuration) {
    throw new AppError(
      'Selected slot is shorter than service duration.',
      400,
      'SLOT_TOO_SHORT'
    );
  }
};

const assertFutureSlot = (slotDate, startTime) => {
  const [year, month, day] = dateKey(slotDate).split('-').map((n) => parseInt(n, 10));
  const [hour, minute, second = 0] = normalizeTime(startTime).split(':').map((n) => parseInt(n, 10));
  const startUtcMs = Date.UTC(year, month - 1, day, hour, minute, second) -
    APP_TIMEZONE_OFFSET * 60 * 1000;

  if (Number.isNaN(startUtcMs) || startUtcMs <= Date.now()) {
    throw new AppError('Appointment slot cannot be in the past', 400, 'PAST_SLOT');
  }
};

const paymentStatusFor = (paymentMethod, amount) => (
  paymentMethod === 'none' || Number(amount) === 0 ? 'captured' : 'pending'
);

const assertStatusTransition = (fromStatus, toStatus) => {
  if (TERMINAL_BOOKING_STATUSES.includes(fromStatus)) {
    throw new AppError(
      `Booking is ${fromStatus} and cannot be changed.`,
      400,
      'BOOKING_TERMINAL'
    );
  }
  if (fromStatus === toStatus) {
    throw new AppError(
      `Booking is already ${toStatus}.`,
      400,
      'BOOKING_STATUS_UNCHANGED'
    );
  }

  const allowed = BOOKING_STATUS_TRANSITIONS[fromStatus] || [];
  if (!allowed.includes(toStatus)) {
    throw new AppError(
      `Invalid booking status transition from ${fromStatus} to ${toStatus}.`,
      400,
      'INVALID_BOOKING_STATUS_TRANSITION'
    );
  }
};

const bookingSelect = `
  SELECT
    b.id,
    b.booking_number,
    b.user_id AS customer_id,
    b.customer_name,
    b.customer_mobile,
    b.customer_email,
    b.merchant_id,
    b.service_id,
    b.provider_id,
    b.slot_id,
    b.booking_date AS appointment_date,
    b.booking_time,
    COALESCE(b.start_time, b.booking_time) AS start_time,
    b.end_time,
    b.address_id,
    b.address_text,
    b.location_lat,
    b.location_lng,
    b.notes,
    b.service_price,
    b.discount_amount,
    b.final_price,
    b.payment_status,
    b.payment_method,
    b.payment_reference_id,
    b.booking_status AS status,
    b.cancellation_reason,
    b.is_emergency,
    b.created_at,
    b.updated_at,
    s.name AS service_name,
    s.duration_minutes,
    s.is_home_visit,
    sp.staff_name AS provider_name,
    sp.specialization AS provider_specialization,
    m.store_name,
    m.store_slug,
    c.slug AS category_slug,
    c.name AS category_name
  FROM bookings b
  JOIN services s ON s.id = b.service_id
  LEFT JOIN service_providers sp ON sp.id = b.provider_id
  JOIN merchants m ON m.id = b.merchant_id
  LEFT JOIN categories c ON c.id = s.category_id
`;

const fetchBooking = async (db, id) => {
  const { rows } = await db.query(`${bookingSelect} WHERE b.id = $1`, [id]);
  return rows[0] || null;
};

const assertMerchantOwnsProvider = async (db, providerId, merchantId) => {
  const { rows } = await db.query(
    `SELECT * FROM service_providers
     WHERE id = $1 AND merchant_id = $2`,
    [providerId, merchantId]
  );
  if (!rows[0]) throw new AppError('Provider not found for this merchant', 404, 'PROVIDER_NOT_FOUND');
  return rows[0];
};

const assertMerchantOwnsService = async (db, serviceId, merchantId) => {
  const { rows } = await db.query(
    `SELECT s.*, c.slug AS category_slug
     FROM services s
     LEFT JOIN categories c ON c.id = s.category_id
     WHERE s.id = $1 AND s.merchant_id = $2`,
    [serviceId, merchantId]
  );
  if (!rows[0]) throw new AppError('Service not found for this merchant', 404, 'SERVICE_NOT_FOUND');
  return rows[0];
};

const fetchActiveServiceCategory = async (db, categoryId) => {
  const { rows } = await db.query(
    `SELECT id, slug FROM categories
     WHERE id = $1 AND store_category = 'service' AND is_active = true`,
    [categoryId]
  );
  if (!rows[0]) throw new AppError('Active service category not found', 404, 'CATEGORY_NOT_FOUND');
  return rows[0];
};

const assertProviderMatchesCategory = (provider, categorySlug) => {
  const expectedSlug = toCategorySlug(provider.service_category);
  if (categorySlug && expectedSlug && categorySlug !== expectedSlug) {
    throw new AppError(
      'Provider category does not match service category',
      400,
      'SERVICE_PROVIDER_CATEGORY_MISMATCH'
    );
  }
};

const assertSlotServiceCompatible = (provider, service, slotTimes = null) => {
  if (service.provider_id && !isSameUuid(service.provider_id, provider.id)) {
    throw new AppError(
      'Service is assigned to a different provider',
      400,
      'SLOT_PROVIDER_MISMATCH'
    );
  }

  assertProviderMatchesCategory(provider, service.category_slug);
  if (slotTimes) assertSlotDurationFitsService(slotTimes, service);
};

const AppointmentService = {
  listCategories: async () => {
    const slugs = Object.values(CATEGORY_SLUG_BY_SERVICE_CATEGORY);
    const { rows } = await query(
      `SELECT id, name, slug, icon, color_code, store_category, sort_order
       FROM categories
       WHERE store_category = 'service'
         AND slug = ANY($1)
         AND is_active = true
       ORDER BY sort_order ASC, name ASC`,
      [slugs]
    );
    return rows;
  },

  listServices: async (filters = {}, pagination = {}) => {
    const params = [];
    const clauses = [
      's.is_active = true',
      "m.merchant_status = 'active'",
      'm.is_active = true',
    ];

    if (filters.category) {
      const serviceCategory = toServiceCategory(filters.category);
      const slug = toCategorySlug(filters.category);
      params.push(slug, serviceCategory);
      clauses.push(`(c.slug = $${params.length - 1} OR sp.service_category = $${params.length})`);
    }
    if (filters.merchant_id) {
      params.push(filters.merchant_id);
      clauses.push(`s.merchant_id = $${params.length}`);
    }
    if (filters.provider_id) {
      params.push(filters.provider_id);
      clauses.push(`s.provider_id = $${params.length}`);
    }
    if (filters.search) {
      params.push(`%${filters.search}%`);
      clauses.push(`(s.name ILIKE $${params.length} OR s.description ILIKE $${params.length})`);
    }
    if (filters.is_home_visit !== undefined) {
      params.push(filters.is_home_visit);
      clauses.push(`s.is_home_visit = $${params.length}`);
    }

    return queryPaginated(
      `SELECT
         s.id, s.merchant_id, s.provider_id, s.category_id,
         s.name, s.description, s.duration_minutes,
         s.price, s.discount_price,
         COALESCE(s.discount_price, s.price) AS final_price,
         s.image_url, s.is_home_visit, s.is_active,
         m.store_name, m.store_slug, m.rating AS merchant_rating,
         sp.staff_name AS provider_name,
         sp.specialization AS provider_specialization,
         sp.service_category,
         c.slug AS category_slug, c.name AS category_name
       FROM services s
       JOIN merchants m ON m.id = s.merchant_id
       LEFT JOIN service_providers sp ON sp.id = s.provider_id
       LEFT JOIN categories c ON c.id = s.category_id
       WHERE ${clauses.join(' AND ')}
       ORDER BY m.is_featured DESC, m.rating DESC, s.created_at DESC`,
      params,
      pagination
    );
  },

  getService: async (id) => {
    const { rows } = await query(
      `SELECT
         s.*,
         COALESCE(s.discount_price, s.price) AS final_price,
         m.store_name, m.store_slug, m.rating AS merchant_rating,
         m.store_logo_url, m.store_banner_url, m.store_description,
         sp.staff_name AS provider_name,
         sp.specialization AS provider_specialization,
         sp.qualification AS provider_qualification,
         sp.experience_years,
         sp.service_category,
         c.slug AS category_slug, c.name AS category_name
       FROM services s
       JOIN merchants m ON m.id = s.merchant_id
       LEFT JOIN service_providers sp ON sp.id = s.provider_id
       LEFT JOIN categories c ON c.id = s.category_id
       WHERE s.id = $1
         AND s.is_active = true
         AND m.merchant_status = 'active'
         AND m.is_active = true`,
      [id]
    );
    if (!rows[0]) throw new AppError('Service not found', 404, 'SERVICE_NOT_FOUND');
    return rows[0];
  },

  createService: async (merchantId, payload) => {
    return withTransaction(async (client) => {
      let provider = null;
      if (payload.provider_id) {
        provider = await assertMerchantOwnsProvider(client, payload.provider_id, merchantId);
      }

      const category = await fetchActiveServiceCategory(client, payload.category_id);
      if (provider) assertProviderMatchesCategory(provider, category.slug);

      const { rows } = await client.query(
        `INSERT INTO services
           (merchant_id, provider_id, category_id, name, description,
            duration_minutes, price, discount_price, image_url, is_home_visit, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING *`,
        [
          merchantId,
          payload.provider_id || null,
          payload.category_id,
          payload.name,
          payload.description || null,
          payload.duration_minutes,
          payload.price,
          payload.discount_price || null,
          payload.image_url || null,
          payload.is_home_visit,
          payload.is_active,
        ]
      );
      return rows[0];
    });
  },

  updateService: async (merchantId, serviceId, payload) => {
    return withTransaction(async (client) => {
      const service = await assertMerchantOwnsService(client, serviceId, merchantId);
      const category = payload.category_id
        ? await fetchActiveServiceCategory(client, payload.category_id)
        : { id: service.category_id, slug: service.category_slug };
      const nextProviderId = hasOwn(payload, 'provider_id') ? payload.provider_id : service.provider_id;
      if (nextProviderId) {
        const provider = await assertMerchantOwnsProvider(client, nextProviderId, merchantId);
        assertProviderMatchesCategory(provider, category.slug);
      }

      const fields = [];
      const values = [];
      Object.entries(payload).forEach(([key, value]) => {
        fields.push(`${key} = $${fields.length + 1}`);
        values.push(value);
      });
      values.push(serviceId, merchantId);

      const { rows } = await client.query(
        `UPDATE services
         SET ${fields.join(', ')}, updated_at = NOW()
         WHERE id = $${values.length - 1} AND merchant_id = $${values.length}
         RETURNING *`,
        values
      );
      return rows[0];
    });
  },

  listProviders: async (filters = {}, pagination = {}, actor = null) => {
    const params = [];
    const clauses = [
      "m.merchant_status = 'active'",
      'm.is_active = true',
    ];
    const actorRole = actor?.role || 'public';
    const allowInactive = filters.include_inactive === true &&
      ['merchant', 'admin'].includes(actorRole);

    if (!allowInactive) {
      clauses.push('sp.is_available = true');
    }
    if (filters.category) {
      params.push(toServiceCategory(filters.category));
      clauses.push(`sp.service_category = $${params.length}`);
    }
    if (allowInactive && actorRole === 'merchant') {
      params.push(actor.id);
      clauses.push(`sp.merchant_id = $${params.length}`);
    } else if (filters.merchant_id) {
      params.push(filters.merchant_id);
      clauses.push(`sp.merchant_id = $${params.length}`);
    }

    return queryPaginated(
      `SELECT
         sp.id, sp.merchant_id, sp.service_category, sp.staff_name,
         sp.specialization, sp.experience_years, sp.qualification,
         sp.profile_image_url, sp.is_available, sp.rating, sp.total_reviews,
         m.store_name, m.store_slug, m.store_logo_url,
         (SELECT COUNT(*) FROM services s
          WHERE s.provider_id = sp.id AND s.is_active = true) AS service_count
       FROM service_providers sp
       JOIN merchants m ON m.id = sp.merchant_id
       WHERE ${clauses.join(' AND ')}
       ORDER BY sp.rating DESC, sp.created_at DESC`,
      params,
      pagination
    );
  },

  getProvider: async (id) => {
    const { rows } = await query(
      `SELECT
         sp.*,
         m.store_name, m.store_slug, m.store_logo_url,
         m.store_description, m.rating AS merchant_rating
       FROM service_providers sp
       JOIN merchants m ON m.id = sp.merchant_id
       WHERE sp.id = $1
         AND sp.is_available = true
         AND m.merchant_status = 'active'
         AND m.is_active = true`,
      [id]
    );
    if (!rows[0]) throw new AppError('Provider not found', 404, 'PROVIDER_NOT_FOUND');
    return rows[0];
  },

  createProvider: async (merchantId, payload) => {
    const { rows } = await query(
      `INSERT INTO service_providers
         (merchant_id, service_category, staff_name, specialization,
          experience_years, qualification, profile_image_url, is_available)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        merchantId,
        toServiceCategory(payload.service_category),
        payload.staff_name || null,
        payload.specialization || null,
        payload.experience_years || null,
        payload.qualification || null,
        payload.profile_image_url || null,
        payload.is_available,
      ]
    );
    return rows[0];
  },

  updateProvider: async (merchantId, providerId, payload) => {
    await assertMerchantOwnsProvider({ query }, providerId, merchantId);
    const fields = [];
    const values = [];
    Object.entries(payload).forEach(([key, value]) => {
      fields.push(`${key} = $${fields.length + 1}`);
      values.push(key === 'service_category' ? toServiceCategory(value) : value);
    });
    values.push(providerId, merchantId);

    const { rows } = await query(
      `UPDATE service_providers
       SET ${fields.join(', ')}
       WHERE id = $${values.length - 1} AND merchant_id = $${values.length}
       RETURNING *`,
      values
    );
    return rows[0];
  },

  listSlots: async ({ providerId, serviceId, date }) => {
    const params = [providerId, date, serviceId || null];
    const clock = appClock();
    const { rows } = await query(
      `SELECT
         ss.id, ss.provider_id, ss.service_id, ss.slot_date,
         ss.start_time, ss.end_time, ss.is_booked, ss.is_blocked, ss.is_active,
         EXISTS (
           SELECT 1 FROM bookings b
           WHERE b.slot_id = ss.id
             AND b.booking_status = ANY($4::booking_status[])
         ) AS has_active_booking,
         EXISTS (
           SELECT 1 FROM bookings b
           WHERE b.slot_id = ss.id
         ) AS has_any_booking,
         (
           ss.is_blocked = false
           AND ss.is_active = true
           AND ss.is_booked = false
           AND NOT EXISTS (
             SELECT 1 FROM bookings b
             WHERE b.slot_id = ss.id
               AND b.booking_status = ANY($4::booking_status[])
           )
           AND (
             ss.slot_date > $5::date OR
             (ss.slot_date = $5::date AND ss.start_time > $6::time)
           )
         ) AS is_available
       FROM service_slots ss
       JOIN service_providers sp ON sp.id = ss.provider_id
       WHERE ss.provider_id = $1
         AND ss.slot_date = $2
         AND ss.is_active = true
         AND sp.is_available = true
         AND ($3::uuid IS NULL OR ss.service_id IS NULL OR ss.service_id = $3)
       ORDER BY ss.start_time ASC`,
      [...params, ACTIVE_BOOKING_STATUSES, clock.today, clock.currentTime]
    );
    return rows;
  },

  createSlot: async (merchantId, payload) => {
    assertTimeRange(payload.start_time, payload.end_time);
    assertFutureSlot(payload.slot_date, payload.start_time);

    try {
      return await withTransaction(async (client) => {
        const provider = await assertMerchantOwnsProvider(client, payload.provider_id, merchantId);
        if (payload.service_id) {
          const service = await assertMerchantOwnsService(client, payload.service_id, merchantId);
          assertSlotServiceCompatible(provider, service, {
            start_time: payload.start_time,
            end_time: payload.end_time,
          });
        }

        const { rows } = await client.query(
          `INSERT INTO service_slots
             (provider_id, service_id, slot_date, start_time, end_time, is_blocked)
           VALUES ($1,$2,$3,$4,$5,$6)
           RETURNING *`,
          [
            payload.provider_id,
            payload.service_id || null,
            payload.slot_date,
            payload.start_time,
            payload.end_time,
            payload.is_blocked,
          ]
        );
        return rows[0];
      });
    } catch (err) {
      if (err.code === '23505') {
        throw new AppError('Slot already exists for this provider and time', 409, 'SLOT_CONFLICT');
      }
      throw err;
    }
  },

  updateSlot: async (merchantId, slotId, payload) => {
    try {
      return await withTransaction(async (client) => {
        const { rows: slotRows } = await client.query(
          `SELECT ss.*, sp.service_category, sp.merchant_id AS provider_merchant_id
           FROM service_slots ss
           JOIN service_providers sp ON sp.id = ss.provider_id
           WHERE ss.id = $1 AND sp.merchant_id = $2 AND ss.is_active = true
           FOR UPDATE OF ss`,
          [slotId, merchantId]
        );
        const slot = slotRows[0];
        if (!slot) throw new AppError('Slot not found', 404, 'SLOT_NOT_FOUND');

        const { rows: bookingRows } = await client.query(
          `SELECT id FROM bookings
           WHERE slot_id = $1 AND booking_status = ANY($2::booking_status[])
           LIMIT 1`,
          [slotId, ACTIVE_BOOKING_STATUSES]
        );
        if (bookingRows[0]) {
          throw new AppError('Booked slots cannot be edited', 400, 'BOOKED_SLOT_LOCKED');
        }

        const nextDate = payload.slot_date || slot.slot_date;
        const nextStart = payload.start_time || slot.start_time;
        const nextEnd = payload.end_time || slot.end_time;
        assertTimeRange(nextStart, nextEnd);
        assertFutureSlot(nextDate, nextStart);

        const nextServiceId = hasOwn(payload, 'service_id') ? payload.service_id : slot.service_id;
        if (nextServiceId) {
          const service = await assertMerchantOwnsService(client, nextServiceId, merchantId);
          assertSlotServiceCompatible({
            id: slot.provider_id,
            service_category: slot.service_category,
          }, service, {
            start_time: nextStart,
            end_time: nextEnd,
          });
        }

        const fields = [];
        const values = [];
        Object.entries(payload).forEach(([key, value]) => {
          fields.push(`${key} = $${fields.length + 1}`);
          values.push(value);
        });
        values.push(slotId);

        const { rows } = await client.query(
          `UPDATE service_slots
           SET ${fields.join(', ')}
           WHERE id = $${values.length} AND is_active = true
           RETURNING *`,
          values
        );
        return rows[0];
      });
    } catch (err) {
      if (err.code === '23505') {
        throw new AppError('Slot already exists for this provider and time', 409, 'SLOT_CONFLICT');
      }
      throw err;
    }
  },

  deleteSlot: async (merchantId, slotId) => {
    return withTransaction(async (client) => {
      const { rows: slotRows } = await client.query(
        `SELECT ss.*
         FROM service_slots ss
         JOIN service_providers sp ON sp.id = ss.provider_id
         WHERE ss.id = $1 AND sp.merchant_id = $2 AND ss.is_active = true
         FOR UPDATE OF ss`,
        [slotId, merchantId]
      );
      if (!slotRows[0]) throw new AppError('Slot not found', 404, 'SLOT_NOT_FOUND');

      const { rows: bookingRows } = await client.query(
        `SELECT id, booking_status FROM bookings
         WHERE slot_id = $1
         LIMIT 1`,
        [slotId]
      );
      if (bookingRows[0]) {
        const { rows } = await client.query(
          `UPDATE service_slots
           SET is_active = false,
               is_blocked = true
           WHERE id = $1
           RETURNING *`,
          [slotId]
        );
        return { deleted: false, deactivated: true, slot: rows[0] };
      }

      await client.query('DELETE FROM service_slots WHERE id = $1', [slotId]);
      return { deleted: true, deactivated: false };
    });
  },

  createBooking: async (customerId, payload) => {
    try {
      return await withTransaction(async (client) => {
        const { rows: serviceRows } = await client.query(
          `SELECT
             s.*,
             COALESCE(s.discount_price, s.price) AS final_price,
             m.merchant_status, m.is_active AS merchant_active,
             c.slug AS category_slug
           FROM services s
           JOIN merchants m ON m.id = s.merchant_id
           LEFT JOIN categories c ON c.id = s.category_id
           WHERE s.id = $1 AND s.is_active = true`,
          [payload.service_id]
        );
        const service = serviceRows[0];
        if (!service || service.merchant_status !== 'active' || !service.merchant_active) {
          throw new AppError('Service is not available for booking', 404, 'SERVICE_UNAVAILABLE');
        }
        if (service.is_home_visit && !payload.address_id && !payload.address_text) {
          throw new AppError('Address/location is required for home visit booking', 400, 'ADDRESS_REQUIRED');
        }

        const { rows: slotRows } = await client.query(
          `SELECT ss.*, sp.merchant_id AS provider_merchant_id,
                  sp.service_category, sp.is_available AS provider_available
           FROM service_slots ss
           JOIN service_providers sp ON sp.id = ss.provider_id
           WHERE ss.id = $1 AND ss.is_active = true
           FOR UPDATE OF ss`,
          [payload.slot_id]
        );
        const slot = slotRows[0];
        if (!slot) throw new AppError('Slot not found', 404, 'SLOT_NOT_FOUND');

        if (!slot.provider_available) {
          throw new AppError('Provider is not available', 400, 'PROVIDER_UNAVAILABLE');
        }
        if (payload.provider_id && !isSameUuid(payload.provider_id, slot.provider_id)) {
          throw new AppError('Slot does not belong to the selected provider', 400, 'SLOT_PROVIDER_MISMATCH');
        }
        if (!isSameUuid(slot.provider_merchant_id, service.merchant_id)) {
          throw new AppError('Slot does not belong to the selected service merchant', 400, 'SLOT_SERVICE_MISMATCH');
        }
        if (service.provider_id && !isSameUuid(service.provider_id, slot.provider_id)) {
          throw new AppError('Slot does not belong to the service provider', 400, 'SLOT_PROVIDER_MISMATCH');
        }
        if (slot.service_id && !isSameUuid(slot.service_id, service.id)) {
          throw new AppError('Slot is reserved for a different service', 400, 'SLOT_SERVICE_MISMATCH');
        }

        const expectedCategory = toCategorySlug(slot.service_category);
        if (service.category_slug && expectedCategory && service.category_slug !== expectedCategory) {
          throw new AppError('Provider category does not match selected service', 400, 'SERVICE_PROVIDER_CATEGORY_MISMATCH');
        }

        if (slot.is_booked || slot.is_blocked) {
          throw new AppError('Slot already booked, please choose another time.', 409, 'SLOT_ALREADY_BOOKED');
        }
        assertFutureSlot(slot.slot_date, slot.start_time);
        assertSlotDurationFitsService(slot, service);

        const { rows: activeRows } = await client.query(
          `SELECT id FROM bookings
           WHERE slot_id = $1 AND booking_status = ANY($2::booking_status[])
           FOR UPDATE`,
          [slot.id, ACTIVE_BOOKING_STATUSES]
        );
        if (activeRows[0]) {
          throw new AppError('Slot already booked, please choose another time.', 409, 'SLOT_ALREADY_BOOKED');
        }

        const finalPrice = Number(service.final_price || service.price || 0);
        const bookingNumber = generateBookingNumber();
        const status = 'pending';
        const paymentStatus = paymentStatusFor(payload.payment_method, finalPrice);

        const { rows } = await client.query(
          `INSERT INTO bookings
             (booking_number, user_id, merchant_id, service_id, provider_id, slot_id,
              booking_date, booking_time, start_time, end_time, address_id,
              notes, service_price, discount_amount, final_price,
              payment_status, payment_method, payment_reference_id, booking_status,
              is_emergency, customer_name, customer_mobile, customer_email,
              address_text, location_lat, location_lng)
           VALUES
             ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,0,$14,$15,$16,$17,$18,
              $19,$20,$21,$22,$23,$24,$25)
           RETURNING id`,
          [
            bookingNumber,
            customerId,
            service.merchant_id,
            service.id,
            slot.provider_id,
            slot.id,
            slot.slot_date,
            slot.start_time,
            slot.start_time,
            slot.end_time,
            payload.address_id || null,
            payload.notes || null,
            service.price,
            finalPrice,
            paymentStatus,
            payload.payment_method,
            payload.payment_reference_id || null,
            status,
            payload.is_emergency,
            payload.customer_name,
            payload.customer_mobile,
            payload.customer_email || null,
            payload.address_text || null,
            payload.location_lat || null,
            payload.location_lng || null,
          ]
        );

        await client.query(
          `UPDATE service_slots
           SET is_booked = true,
               service_id = COALESCE(service_id, $2)
           WHERE id = $1`,
          [slot.id, service.id]
        );

        return fetchBooking(client, rows[0].id);
      });
    } catch (err) {
      if (err.code === '23505') {
        throw new AppError('Slot already booked, please choose another time.', 409, 'SLOT_ALREADY_BOOKED');
      }
      throw err;
    }
  },

  getBookingForActor: async (bookingId, actor) => {
    const booking = await fetchBooking({ query }, bookingId);
    if (!booking) throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');

    if (actor.role === 'customer' && !isSameUuid(booking.customer_id, actor.id)) {
      throw new AppError('You cannot view this booking', 403, 'BOOKING_FORBIDDEN');
    }
    if (actor.role === 'merchant' && !isSameUuid(booking.merchant_id, actor.id)) {
      throw new AppError('You cannot view this booking', 403, 'BOOKING_FORBIDDEN');
    }
    return booking;
  },

  listCustomerBookings: async (customerId, actor, filters = {}, pagination = {}) => {
    if (actor.role === 'customer' && !isSameUuid(customerId, actor.id)) {
      throw new AppError('You cannot view another customer bookings', 403, 'BOOKING_FORBIDDEN');
    }

    const params = [customerId];
    const clauses = ['b.user_id = $1'];
    if (filters.status) {
      params.push(filters.status);
      clauses.push(`b.booking_status = $${params.length}`);
    }

    return queryPaginated(
      `${bookingSelect}
       WHERE ${clauses.join(' AND ')}
       ORDER BY b.booking_date DESC, b.booking_time DESC`,
      params,
      pagination
    );
  },

  listMerchantBookings: async (merchantId, filters = {}, pagination = {}) => {
    const params = [merchantId];
    const clauses = ['b.merchant_id = $1'];
    const clock = appClock();

    if (filters.status) {
      params.push(filters.status);
      clauses.push(`b.booking_status = $${params.length}`);
    }
    if (filters.scope === 'today') {
      params.push(clock.today);
      clauses.push(`b.booking_date = $${params.length}::date`);
    } else if (filters.scope === 'upcoming') {
      params.push(clock.today);
      clauses.push(`b.booking_date >= $${params.length}::date AND b.booking_status NOT IN ('completed','cancelled','no_show','rejected')`);
    } else if (filters.scope === 'past') {
      params.push(clock.today);
      clauses.push(`(b.booking_date < $${params.length}::date OR b.booking_status IN ('completed','cancelled','no_show','rejected'))`);
    }

    return queryPaginated(
      `${bookingSelect}
       WHERE ${clauses.join(' AND ')}
       ORDER BY b.booking_date ASC, b.booking_time ASC`,
      params,
      pagination
    );
  },

  updateBookingStatus: async (bookingId, actor, payload) => {
    return withTransaction(async (client) => {
      const clock = appClock();
      const { rows } = await client.query(
        `SELECT *,
                (
                  booking_date > $2::date OR
                  (booking_date = $2::date AND COALESCE(start_time, booking_time) > $3::time)
                ) AS is_future
         FROM bookings
         WHERE id = $1
         FOR UPDATE`,
        [bookingId, clock.today, clock.currentTime]
      );
      const booking = rows[0];
      if (!booking) throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');

      if (!['customer', 'merchant', 'admin'].includes(actor.role)) {
        throw new AppError('Role cannot update booking status', 403, 'BOOKING_FORBIDDEN');
      }
      if (actor.role === 'merchant' && !isSameUuid(booking.merchant_id, actor.id)) {
        throw new AppError('You cannot update another merchant booking', 403, 'BOOKING_FORBIDDEN');
      }
      if (actor.role === 'customer' && !isSameUuid(booking.user_id, actor.id)) {
        throw new AppError('You cannot update this booking', 403, 'BOOKING_FORBIDDEN');
      }
      assertStatusTransition(booking.booking_status, payload.status);
      if (actor.role === 'customer') {
        if (payload.status !== 'cancelled') {
          throw new AppError('Customers can only cancel their own bookings', 403, 'BOOKING_STATUS_FORBIDDEN');
        }
        if (!['pending', 'confirmed'].includes(booking.booking_status)) {
          throw new AppError(
            'Customers can only cancel pending or confirmed bookings',
            403,
            'BOOKING_STATUS_FORBIDDEN'
          );
        }
        if (!booking.is_future) {
          throw new AppError('Booking can be cancelled only before appointment time', 400, 'CANCELLATION_WINDOW_CLOSED');
        }
      }

      const releaseSlot = ['cancelled', 'rejected'].includes(payload.status);
      const { rows: updatedRows } = await client.query(
        `UPDATE bookings
         SET booking_status = $1,
             cancellation_reason = CASE WHEN $1 IN ('cancelled','rejected') THEN $2 ELSE cancellation_reason END,
             cancelled_by = CASE WHEN $1 = 'cancelled' THEN $3::user_role ELSE cancelled_by END,
             updated_at = NOW()
         WHERE id = $4
         RETURNING id, slot_id`,
        [payload.status, payload.reason || null, actor.role, bookingId]
      );

      if (releaseSlot && updatedRows[0].slot_id) {
        await client.query(
          `UPDATE service_slots
           SET is_booked = false
           WHERE id = $1`,
          [updatedRows[0].slot_id]
        );
      }

      return fetchBooking(client, bookingId);
    });
  },
};

module.exports = AppointmentService;
