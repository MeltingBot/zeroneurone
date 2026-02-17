# ============================================================================
# zeroneurone - App-only Docker build (nginx)
# ============================================================================
#
# Serves the React web application as static files via nginx.
# The WebSocket relay runs as a separate container (see relay/Dockerfile).
#
# Build: docker build -t zeroneurone .
# Run:   docker run -p 80:80 zeroneurone
#
# For single-container deployment (app + relay combined),
# use Dockerfile.combined instead.
#
# ============================================================================

# ----------------------------------------------------------------------------
# Stage 1: Build the React application
# ----------------------------------------------------------------------------
FROM node:22-alpine AS builder

# Git commit hash passed at build time
ARG GIT_COMMIT=unknown

WORKDIR /app

# Copy package files first for better layer caching
COPY package.json package-lock.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Build the application with version info
ENV VITE_APP_VERSION=$GIT_COMMIT
RUN npx vite build

# Copy external plugins into dist (if any .js or manifest.json in plugins/)
RUN cp -f plugins/*.json plugins/*.js dist/plugins/ 2>/dev/null || true

# ----------------------------------------------------------------------------
# Stage 2: nginx for static file serving
# ----------------------------------------------------------------------------
FROM nginx:alpine AS production

# Install curl for healthcheck
RUN apk add --no-cache curl

# Copy built static files
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose HTTP port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:80/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
