# ============================================================================
# zeroneurone - Multi-stage Docker build
# ============================================================================
#
# This Dockerfile creates a production-ready container that serves:
# - The React web application (static files)
# - WebSocket relay server for real-time collaboration
#
# Single port deployment - everything through one endpoint.
#
# Build: docker build -t zeroneurone .
# Run:   docker run -p 3000:3000 zeroneurone
#
# ============================================================================

# ----------------------------------------------------------------------------
# Stage 1: Build the React application
# ----------------------------------------------------------------------------
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files first for better layer caching
COPY package.json package-lock.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Build the application
# Skip TypeScript strict checking, use Vite directly
RUN npx vite build

# ----------------------------------------------------------------------------
# Stage 2: Production server
# ----------------------------------------------------------------------------
FROM node:22-alpine AS production

WORKDIR /app

# Copy package files and install only production dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy built static files from builder stage
COPY --from=builder /app/dist ./dist

# Copy production server
COPY server/index.js ./server/index.js

# Create non-root user for security
RUN addgroup -g 1001 -S zeroneurone && \
    adduser -S zeroneurone -u 1001 -G zeroneurone && \
    chown -R zeroneurone:zeroneurone /app

USER zeroneurone

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Expose the single port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start the server
CMD ["node", "server/index.js"]
