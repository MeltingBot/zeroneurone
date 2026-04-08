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
# In npm workspaces, the canonical lock file is the parent's.
# The build script copies it into the build context before building.
COPY package.json package-lock.json ./

# Install all dependencies (including devDependencies for build)
# Mount cache: reuses npm cache across builds even when package.json changes
RUN --mount=type=cache,target=/root/.npm npm ci

# Copy source code
COPY . .

# Build the application with version info
ENV VITE_APP_VERSION=$GIT_COMMIT
RUN npx vite build

# Copy external plugins into dist (if any .js or manifest.json in plugins/)
RUN cp -f plugins/*.json plugins/*.js dist/plugins/ 2>/dev/null || true

# Generate manifest v2 with integrity hashes for all plugins in dist/plugins/
# If plugins/ contains a manifest.json with trust levels, it is used as base.
# Otherwise, a fresh manifest v2 is generated from the .js files present.
RUN node -e " \
  const fs = require('fs'); \
  const crypto = require('crypto'); \
  const path = require('path'); \
  const dir = 'dist/plugins'; \
  const manifestPath = path.join(dir, 'manifest.json'); \
  let manifest = { plugins: [] }; \
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')); } catch {} \
  if (!manifest.plugins || manifest.plugins.length === 0) process.exit(0); \
  manifest.manifestVersion = '2'; \
  for (const entry of manifest.plugins) { \
    const filePath = path.join(dir, entry.file); \
    if (!fs.existsSync(filePath)) continue; \
    const hash = crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex'); \
    entry.integrity = hash; \
    if (!entry.trust) entry.trust = 'trusted'; \
  } \
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\\n'); \
  console.log('[Docker] Manifest v2 generated with', manifest.plugins.length, 'plugin(s)'); \
"

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
