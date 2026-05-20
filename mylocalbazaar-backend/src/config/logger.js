// src/config/logger.js
// ─────────────────────────────────────────────────────────────
// Winston Logger — MyLocalBazaar.store
// Outputs: console (dev) + rotating daily log files (prod)
// Levels: error | warn | info | http | debug
// ─────────────────────────────────────────────────────────────

const winston = require('winston');
require('winston-daily-rotate-file');
const path = require('path');

const { combine, timestamp, printf, colorize, errors, json } = winston.format;
const LOG_DIR = process.env.LOG_DIR || './logs';
const LOG_LEVEL = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

// ── Custom console format (human-readable in dev) ─────────────
const devFormat = combine(
  colorize({ all: true }),
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp, stack, ...meta }) => {
    let log = `${timestamp} [${level}]: ${message}`;
    if (stack) log += `\n${stack}`;
    if (Object.keys(meta).length) log += `\n${JSON.stringify(meta, null, 2)}`;
    return log;
  })
);

// ── JSON format for production log files ──────────────────────
const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  json()
);

// ── Rotating file transports ──────────────────────────────────
const errorFileTransport = new winston.transports.DailyRotateFile({
  filename:  path.join(LOG_DIR, 'error-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  level: 'error',
  maxSize:  process.env.LOG_MAX_SIZE  || '20m',
  maxFiles: process.env.LOG_MAX_FILES || '14d',
  zippedArchive: true,
  format: prodFormat,
});

const combinedFileTransport = new winston.transports.DailyRotateFile({
  filename:  path.join(LOG_DIR, 'combined-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize:  process.env.LOG_MAX_SIZE  || '20m',
  maxFiles: process.env.LOG_MAX_FILES || '14d',
  zippedArchive: true,
  format: prodFormat,
});

const httpFileTransport = new winston.transports.DailyRotateFile({
  filename:  path.join(LOG_DIR, 'http-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  level: 'http',
  maxSize:  '10m',
  maxFiles: '7d',
  zippedArchive: true,
  format: prodFormat,
});

// ── Build transports array ─────────────────────────────────────
const transports = [errorFileTransport, combinedFileTransport];

if (process.env.NODE_ENV !== 'test') {
  transports.push(
    new winston.transports.Console({
      format: process.env.NODE_ENV === 'production' ? prodFormat : devFormat,
    })
  );
}

if (process.env.NODE_ENV === 'production') {
  transports.push(httpFileTransport);
}

// ── Logger instance ───────────────────────────────────────────
const logger = winston.createLogger({
  level: LOG_LEVEL,
  levels: { ...winston.config.npm.levels, http: 5 },
  transports,
  exitOnError: false,
  silent: process.env.NODE_ENV === 'test',
});

// ── Morgan stream (HTTP request logging) ──────────────────────
logger.stream = {
  write: (message) => logger.http(message.trim()),
};

module.exports = logger;
