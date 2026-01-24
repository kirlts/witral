# ============================================
# Witral - Universal Ingestion Framework
# Multi-stage Dockerfile
# ============================================
# 
# Build stages:
#   - base:        Base image with system dependencies
#   - deps:        npm dependencies installation
#   - development: Hot-reload for local development
#   - builder:     TypeScript compilation
#   - production:  Optimized final image
#
# Usage:
#   Development:  docker build --target development -t witral:dev .
#   Production:   docker build --target production -t witral:latest .

# ============================================
# Stage: Base
# ============================================
FROM node:20-alpine AS base

WORKDIR /app

# System dependencies
# - tini: init system for proper signal handling
# - su-exec: to safely switch users
# - git: required for npm to install some dependencies (like baileys)
RUN apk add --no-cache \
    tini \
    su-exec \
    git \
    && rm -rf /var/cache/apk/*

# ============================================
# Stage: Dependencies
# ============================================
FROM base AS deps

# Copy dependency files
COPY package.json ./
COPY package-lock.json* ./

# Install ALL dependencies (including devDependencies and optionalDependencies)
# We use npm install instead of npm ci because optionalDependencies (like baileys)
# have platform-specific dependencies that npm ci doesn't handle well
# Note: npm install automatically installs optionalDependencies, but we ensure baileys is available
# for a smooth first-run experience (users can use Witral with one command after cloning)
RUN npm install

# ============================================
# Stage: Development
# ============================================
FROM deps AS development

# Create non-root user
RUN addgroup -g 1001 -S witral && \
    adduser -u 1001 -S witral -G witral

# Create data directories and vault at root
RUN mkdir -p /app/data/session /app/data/logs /app/vault/tags /app/vault/groups && \
    chown -R witral:witral /app

# Source code is mounted as volume in docker compose (dev profile)
# This allows hot-reload without rebuild

USER witral

ENV NODE_ENV=development
ENV LOG_LEVEL=debug
ENV LOG_FORMAT=pretty

# Expose port for Node.js Inspector (debugging)
EXPOSE 9229

# Hot-reload with tsx watch
CMD ["npx", "tsx", "watch", "src/index.ts"]

# ============================================
# Stage: Builder
# ============================================
FROM deps AS builder

# Copy TypeScript config first (changes less frequently)
COPY tsconfig.json ./

# Copy source code
# Note: This layer will be invalidated when any file in src/ changes
COPY src/ ./src/

# Compile TypeScript (all dependencies including baileys are now installed)
# This will recompile whenever src/ changes, ensuring latest code is used
RUN npm run build

# Remove devDependencies but keep dependencies and optionalDependencies
# npm prune --production removes only devDependencies
# and automatically keeps dependencies and optionalDependencies
RUN npm prune --production

# ============================================
# Stage: Production
# ============================================
FROM base AS production

# Create non-root user for security
RUN addgroup -g 1001 -S witral && \
    adduser -u 1001 -S witral -G witral

# Copy artifacts from builder
COPY --from=builder --chown=witral:witral /app/dist ./dist
COPY --from=builder --chown=witral:witral /app/node_modules ./node_modules
COPY --from=builder --chown=witral:witral /app/package.json ./
# Copy package-lock.json if it exists (builder stage should have it)
COPY --from=builder --chown=witral:witral /app/package-lock.json ./package-lock.json

# Copy env.example so init-setup.sh can create .env if needed
COPY --chown=witral:witral env.example ./env.example

# Create data directories and vault at root
RUN mkdir -p /app/data/session /app/data/logs /app/vault/tags /app/vault/groups && \
    chown -R witral:witral /app/data

# Copy entrypoint and setup scripts
COPY scripts/entrypoint.sh /app/scripts/entrypoint.sh
COPY scripts/init-setup.sh /app/scripts/init-setup.sh
COPY scripts/healthcheck.js /app/scripts/healthcheck.js
RUN chmod +x /app/scripts/entrypoint.sh /app/scripts/init-setup.sh

# Production environment variables
ENV NODE_ENV=production
ENV LOG_LEVEL=info
ENV LOG_FORMAT=json

# Health check - verifies that the web dashboard is accessible
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=40s \
    CMD node /app/scripts/healthcheck.js

# DO NOT switch user here - entrypoint.sh will do it
# Keep as root so it can adjust permissions

# Use tini as init for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]

# Entrypoint script that adjusts permissions and switches to witral user
CMD ["/app/scripts/entrypoint.sh"]
