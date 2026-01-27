# Dockerfile for building ZeroNeurone documentation
# Uses Hugo with hugo-book theme

FROM hugomods/hugo:exts-0.147.0 AS builder

WORKDIR /src

# Copy Hugo configuration and content
COPY config.toml .
COPY content/ content/
COPY layouts/ layouts/
COPY static/ static/
COPY assets/ assets/

# Install hugo-book theme
RUN mkdir -p themes && \
    git clone --depth 1 https://github.com/alex-shpak/hugo-book.git themes/hugo-book

# Build the static site
RUN hugo --minify

# Production image with nginx
FROM nginx:alpine

# Install curl for healthcheck
RUN apk add --no-cache curl

# Copy built site to nginx
COPY --from=builder /src/public /usr/share/nginx/html

# Custom nginx config for SPA-like behavior
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
