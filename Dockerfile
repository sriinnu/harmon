# ============================================================================
# Harmond — Multi-stage Docker build
#
# Builds the Harmon daemon and all workspace dependencies, then copies
# only the production artifacts into a slim Node.js runtime image.
#
# Usage:
#   docker build -t sriinnu/harmond .
#   docker run -p 17373:17373 \
#     -e SPOTIFY_CLIENT_ID=... \
#     -e HARMON_ENCRYPTION_SECRET=... \
#     -e HARMON_API_TOKEN=... \
#     sriinnu/harmond
# ============================================================================

# Stage 1: Install and build
FROM node:22-slim AS builder

# Install pnpm via corepack (version pinned in root package.json)
RUN corepack enable && corepack prepare pnpm@10.28.1 --activate

WORKDIR /app

# Copy package manifests first (cache layer)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/harmond/package.json apps/harmond/tsconfig.json apps/harmond/
COPY packages/harmon-core/package.json packages/harmon-core/tsconfig.json packages/harmon-core/
COPY packages/harmon-protocol/package.json packages/harmon-protocol/tsconfig.json packages/harmon-protocol/
COPY packages/harmon-store/package.json packages/harmon-store/tsconfig.json packages/harmon-store/
COPY packages/harmon-crypto/package.json packages/harmon-crypto/tsconfig.json packages/harmon-crypto/
COPY packages/harmon-logger/package.json packages/harmon-logger/tsconfig.json packages/harmon-logger/
COPY packages/harmon-spotify/package.json packages/harmon-spotify/tsconfig.json packages/harmon-spotify/
COPY packages/harmon-apple/package.json packages/harmon-apple/tsconfig.json packages/harmon-apple/
COPY packages/harmon-youtube/package.json packages/harmon-youtube/tsconfig.json packages/harmon-youtube/
COPY packages/harmon-flow/package.json packages/harmon-flow/tsconfig.json packages/harmon-flow/
COPY scripts/ scripts/

# Install all deps (frozen lockfile for reproducibility)
RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/ packages/
COPY apps/harmond/ apps/harmond/

# Build harmond and its workspace dependencies (turbo handles order)
RUN pnpm turbo run build --filter=@sriinnu/harmond...

# Stage 2: Production runtime
FROM node:22-slim AS runtime

RUN corepack enable && corepack prepare pnpm@10.28.1 --activate

WORKDIR /app

# Copy root workspace manifests
COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./

# Copy harmond app (package.json, built dist, and bin entrypoint)
COPY --from=builder /app/apps/harmond/package.json apps/harmond/
COPY --from=builder /app/apps/harmond/dist/ apps/harmond/dist/
COPY --from=builder /app/apps/harmond/bin/ apps/harmond/bin/

# Copy workspace dependency packages (package.json + dist only)
COPY --from=builder /app/packages/harmon-core/package.json packages/harmon-core/
COPY --from=builder /app/packages/harmon-core/dist/ packages/harmon-core/dist/
COPY --from=builder /app/packages/harmon-protocol/package.json packages/harmon-protocol/
COPY --from=builder /app/packages/harmon-protocol/dist/ packages/harmon-protocol/dist/
COPY --from=builder /app/packages/harmon-store/package.json packages/harmon-store/
COPY --from=builder /app/packages/harmon-store/dist/ packages/harmon-store/dist/
COPY --from=builder /app/packages/harmon-crypto/package.json packages/harmon-crypto/
COPY --from=builder /app/packages/harmon-crypto/dist/ packages/harmon-crypto/dist/
COPY --from=builder /app/packages/harmon-logger/package.json packages/harmon-logger/
COPY --from=builder /app/packages/harmon-logger/dist/ packages/harmon-logger/dist/
COPY --from=builder /app/packages/harmon-spotify/package.json packages/harmon-spotify/
COPY --from=builder /app/packages/harmon-spotify/dist/ packages/harmon-spotify/dist/
COPY --from=builder /app/packages/harmon-apple/package.json packages/harmon-apple/
COPY --from=builder /app/packages/harmon-apple/dist/ packages/harmon-apple/dist/
COPY --from=builder /app/packages/harmon-youtube/package.json packages/harmon-youtube/
COPY --from=builder /app/packages/harmon-youtube/dist/ packages/harmon-youtube/dist/

# Install production deps only
RUN pnpm install --frozen-lockfile --prod

# Create data directory for SQLite DB
RUN mkdir -p /data && chown node:node /data

# Runtime config
ENV NODE_ENV=production
ENV HARMON_DB_PATH=/data/harmon.db
ENV HARMON_BIND_ADDRESS=0.0.0.0
ENV HARMON_PORT=17373

EXPOSE 17373

# Run as non-root
USER node

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:17373/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Start daemon via bin entrypoint (has signal handlers + graceful shutdown)
CMD ["node", "apps/harmond/bin/harmond.js"]
