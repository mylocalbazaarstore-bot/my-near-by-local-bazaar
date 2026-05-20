// src/middlewares/validate.middleware.js
// ─────────────────────────────────────────────────────────────
// Request Validation — MyLocalBazaar.store
// Uses Joi schemas to validate req.body / req.query / req.params
// ─────────────────────────────────────────────────────────────

const Joi = require('joi');

// ── Validator factory ──────────────────────────────────────────
// Usage: router.post('/route', validate(mySchema), controller)
const validate = (schema, source = 'body') => (req, res, next) => {
  const data = source === 'query' ? req.query
             : source === 'params' ? req.params
             : req.body;

  const { error, value } = schema.validate(data, {
    abortEarly:  false,   // return ALL errors at once
    stripUnknown: true,   // remove extra fields for security
    convert:     true,    // auto-convert types (e.g. "5" → 5)
  });

  if (error) {
    const details = error.details.map((d) => ({
      field:   d.path.join('.'),
      message: d.message.replace(/"/g, ''),
    }));
    return res.status(422).json({
      success: false,
      message: 'Validation failed',
      code:    'VALIDATION_ERROR',
      errors:  details,
    });
  }

  // Replace req[source] with sanitized value
  if (source === 'query')  req.query  = value;
  if (source === 'params') req.params = value;
  if (source === 'body')   req.body   = value;

  next();
};

// ── Common reusable field schemas ─────────────────────────────
const fields = {
  phone:    Joi.string().pattern(/^[6-9]\d{9}$/).required().messages({
              'string.pattern.base': 'Phone must be a valid 10-digit Indian mobile number',
            }),
  email:    Joi.string().email().lowercase().trim(),
  otp:      Joi.string().length(6).pattern(/^\d+$/).required(),
  uuid:     Joi.string().uuid({ version: 'uuidv4' }),
  pincode:  Joi.string().pattern(/^\d{6}$/).required(),
  page:     Joi.number().integer().min(1).default(1),
  limit:    Joi.number().integer().min(1).max(100).default(20),
  password: Joi.string().min(8).max(128)
              .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
              .messages({ 'string.pattern.base': 'Password must include uppercase, lowercase, and a number' }),
};

module.exports = { validate, fields };
