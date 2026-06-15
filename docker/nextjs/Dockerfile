# syntax=docker/dockerfile:1.7

# Build stage
FROM node:22-alpine AS builder

WORKDIR /app
ENV NODE_ENV=development

COPY package.json yarn.lock ./
RUN --mount=type=cache,target=/usr/local/share/.cache/yarn \
	yarn install --frozen-lockfile

COPY . .

# Type checking and linting (dev-only)
RUN yarn run typecheck && yarn run lint

# Build Next.js application
RUN yarn run build

# Runtime stage
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=512"

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

COPY package.json yarn.lock ./
RUN --mount=type=cache,target=/usr/local/share/.cache/yarn \
	yarn install --production --frozen-lockfile && \
	yarn cache clean

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./next.config.ts

# Run as non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
	CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})" || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["yarn", "start"]
