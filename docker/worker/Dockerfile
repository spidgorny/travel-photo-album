# syntax=docker/dockerfile:1.7

# Build stage
FROM node:22-alpine AS builder

WORKDIR /app
ENV NODE_ENV=production

COPY package.json yarn.lock ./
RUN --mount=type=cache,target=/usr/local/share/.cache/yarn \
	yarn install --frozen-lockfile

COPY . .

# Runtime stage
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=512"

# Install runtime dependencies
RUN apk add --no-cache dumb-init ffmpeg

COPY package.json yarn.lock ./
RUN --mount=type=cache,target=/usr/local/share/.cache/yarn \
	yarn install --production --frozen-lockfile && \
	yarn cache clean

COPY --from=builder /app/lib ./lib
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/config.json ./config.json

# Run as non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
USER nodejs

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
	CMD node -e "require('redis').createClient({url: process.env.REDIS_URL || 'redis://localhost:6379'}).ping().catch(() => process.exit(1))" || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["npm", "run", "worker:media"]
