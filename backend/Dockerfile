# Multi-stage Dockerfile for CLOUD-05 Progressive Delivery Microservice

# --- Stage 1: Build & Dependencies ---
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

# Install dependencies needed for potential native builds
RUN apk add --no-cache libc6-compat

# Copy package files from backend directory
COPY backend/package*.json ./

# Install all dependencies (including devDependencies for build/testing)
RUN npm ci

# Copy application source code from backend directory
COPY backend/ ./

# Prune dev dependencies for lean production image
RUN npm prune --production

# --- Stage 2: Production Runner ---
FROM node:20-alpine AS runner

WORKDIR /usr/src/app

ENV NODE_ENV=production
ENV PORT=5005
ENV HOST=0.0.0.0
ENV FRONTEND_PATH=/usr/src/frontend
ENV RELEASE_CONFIG_PATH=/usr/src/app/release_config.json

# Security: Create non-root user group and user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nodeapp

# Copy production node_modules and application code
COPY --from=builder --chown=nodeapp:nodejs /usr/src/app/node_modules ./node_modules
COPY --from=builder --chown=nodeapp:nodejs /usr/src/app/src ./src
COPY --from=builder --chown=nodeapp:nodejs /usr/src/app/package*.json ./
COPY --from=builder --chown=nodeapp:nodejs /usr/src/app/release_config.json ./

# Copy frontend static files from repo root
COPY --chown=nodeapp:nodejs frontend /usr/src/frontend

# Container Healthcheck (Liveness / Readiness verification)
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:5005/health || exit 1

# Expose internal HTTP port
EXPOSE 5005

# Use non-root user for principle of least privilege
USER nodeapp

# Start server
CMD ["node", "src/server.js"]
