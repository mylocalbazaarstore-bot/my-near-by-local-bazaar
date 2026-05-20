# ─────────────────────────────────────────────────────────────
# Dockerfile — MyLocalBazaar.store Backend
# Multi-stage build: builder → production
# Final image: ~150MB | Node 20 Alpine
# ─────────────────────────────────────────────────────────────

# ── Stage 1: Build dependencies ──────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install build tools for native modules (sharp, bcrypt)
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# ── Stage 2: Production image ─────────────────────────────────
FROM node:20-alpine AS production

# Create non-root user for security
RUN addgroup -g 1001 -S mlbgroup && \
    adduser  -u 1001 -S mlbuser -G mlbgroup

WORKDIR /app

# Copy production node_modules from builder
COPY --from=builder --chown=mlbuser:mlbgroup /app/node_modules ./node_modules

# Copy application source
COPY --chown=mlbuser:mlbgroup . .

# Create log directory
RUN mkdir -p logs && chown mlbuser:mlbgroup logs

# Switch to non-root user
USER mlbuser

# Expose API port
EXPOSE 5000

# Health check for Railway / Docker Compose
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:5000/api/v1/health || exit 1

CMD ["node", "src/server.js"]
