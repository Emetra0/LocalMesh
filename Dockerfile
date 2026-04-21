# ── Stage 1: build ───────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /build

# Copy workspace manifests first for better layer caching
COPY package*.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/dashboard/package.json ./apps/dashboard/
RUN npm ci

COPY . .
RUN npm run build

# ── Stage 2: runtime ─────────────────────────────────────────────────────────
FROM node:22-alpine

# git  → git pull during self-update
# docker-cli → rebuild/restart self via Docker socket
# nss  → NSS cert store used by mkcert -install
# bash → entrypoint + scripts
# mkcert is not in Alpine repos — download the static binary from GitHub
RUN apk add --no-cache git docker-cli bash nss ca-certificates curl \
 && MKCERT_VERSION=v1.4.4 \
 && curl -fsSL "https://github.com/FiloSottile/mkcert/releases/download/${MKCERT_VERSION}/mkcert-${MKCERT_VERSION}-linux-amd64" \
      -o /usr/local/bin/mkcert \
 && chmod +x /usr/local/bin/mkcert

WORKDIR /app

# Install only production dependencies
COPY --from=builder /build/package*.json ./
COPY --from=builder /build/apps/api/package.json ./apps/api/
COPY --from=builder /build/apps/dashboard/package.json ./apps/dashboard/
RUN npm ci --omit=dev

# Copy compiled artefacts
COPY --from=builder /build/apps/api/dist ./apps/api/dist
COPY --from=builder /build/apps/dashboard/dist ./apps/dashboard/dist

COPY deploy/docker/localmesh-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 2690
ENV NODE_ENV=production

ENTRYPOINT ["/entrypoint.sh"]
