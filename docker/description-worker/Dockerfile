FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update \
&& apt-get install -y --no-install-recommends curl zstd ca-certificates \
&& rm -rf /var/lib/apt/lists/* \
&& corepack enable

COPY package.json yarn.lock ./
RUN yarn install --production --frozen-lockfile && yarn cache clean

COPY . .
COPY docker/description-worker/entrypoint.sh /usr/local/bin/description-worker-entrypoint
RUN chmod +x /usr/local/bin/description-worker-entrypoint

CMD ["description-worker-entrypoint"]
