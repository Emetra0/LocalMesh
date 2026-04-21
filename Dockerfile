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
# mkcert + nss-tools → generate TLS certs signed by the local CA
# bash → entrypoint + scripts
RUN apk add --no-cache git docker-cli bash mkcert nss-tools ca-certificates

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
