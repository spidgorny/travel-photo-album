# syntax=docker/dockerfile:1.7
FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update \
&& apt-get install -y --no-install-recommends ffmpeg \
&& rm -rf /var/lib/apt/lists/*

COPY package.json yarn.lock ./
RUN --mount=type=cache,target=/usr/local/share/.cache/yarn \
	yarn install --frozen-lockfile

COPY . .

CMD ["npm", "run", "worker:media"]
