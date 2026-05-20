// src/app.js
// ─────────────────────────────────────────────────────────────
// Express Application — MyLocalBazaar.store
// Assembles all middleware, routes, and error handlers
// ─────────────────────────────────────────────────────────────

require('express-async-errors');      // auto-catch async errors without try/catch
require('dotenv').config();

const express     = require('express');
const helmet      = require('helmet');
const cors        = require('cors');
const compression = require('compression');
const morgan      = require('morgan');
const xssClean    = require('xss-clean');
const hpp         = require('hpp');

const logger                      = require('./config/logger');
const { errorHandler, notFound }  = require('./middlewares/error.middleware');
const routes                      = require('./routes/index');

const app = express();

// ── 1. Security Headers (Helmet) ──────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc:     ["'self'", 'data:', 'https://res.cloudinary.com'],
      scriptSrc:  ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,  // allow Cloudinary images
}));

// ── 2. CORS ───────────────────────────────────────────────────
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map((o) => o.trim());

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    logger.warn('CORS blocked origin:', { origin });
    callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials:    true,           // allow cookies & Authorization headers
  methods:        ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

// ── 3. Trust proxy (for Railway / Nginx reverse proxy) ────────
app.set('trust proxy', 1);

// ── 4. Body Parsers ───────────────────────────────────────────
// Raw body for Razorpay webhook (MUST come before express.json)
app.use('/api/v1/payments/webhook/razorpay',
  express.raw({ type: 'application/json' }),
  (req, res, next) => {
    try { req.body = JSON.parse(req.body.toString()); } catch { /* invalid */ }
    next();
  }
);
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// ── 5. HTTP Request Logger (Morgan → Winston) ─────────────────
const morganFormat = process.env.NODE_ENV === 'production'
  ? ':remote-addr :method :url :status :res[content-length] - :response-time ms'
  : 'dev';

app.use(morgan(morganFormat, { stream: logger.stream }));

// ── 6. Compression ────────────────────────────────────────────
app.use(compression());

// ── 7. Security Sanitization ──────────────────────────────────
app.use(xssClean());    // sanitize user input from XSS
app.use(hpp());         // prevent HTTP parameter pollution

// ── 8. API Routes ─────────────────────────────────────────────
app.use('/api/v1', routes);

// ── 9. Root ping ──────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    name:    'MyLocalBazaar.store API',
    company: 'Catalyst Service Private Limited',
    version: 'v1.0.0',
    status:  'running',
    docs:    '/api/v1/health',
  });
});

// ── 10. 404 handler ───────────────────────────────────────────
app.use(notFound);

// ── 11. Global error handler ──────────────────────────────────
app.use(errorHandler);

module.exports = app;
