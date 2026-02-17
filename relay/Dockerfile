# ============================================================================
# zeroneurone relay - Standalone WebSocket relay server
# ============================================================================
#
# E2E encrypted Yjs collaboration relay with async buffering support.
# Designed to run independently from the web application.
#
# Build: docker build -t zeroneurone-relay .
# Run:   docker run -p 4444:4444 zeroneurone-relay
#
# With Redis persistence:
#   docker run -p 4444:4444 -e REDIS_URL=redis://host:6379 zeroneurone-relay
#
# ============================================================================

FROM node:22-alpine

WORKDIR /app

# Install curl for healthcheck
RUN apk add --no-cache curl

# Install dependencies (ws + redis only)
COPY package.json ./
RUN npm install --omit=dev

# Copy relay server
COPY index.js ./

# Create non-root user
RUN addgroup -g 1001 -S zeroneurone && \
    adduser -S zeroneurone -u 1001 -G zeroneurone && \
    chown -R zeroneurone:zeroneurone /app

USER zeroneurone

# Environment
ENV NODE_ENV=production
ENV PORT=4444
ENV HOST=0.0.0.0

EXPOSE 4444

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:4444/health || exit 1

CMD ["node", "index.js"]
