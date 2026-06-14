# syntax=docker/dockerfile:1.7
FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_ENV=development

COPY package.json yarn.lock ./
RUN --mount=type=cache,target=/usr/local/share/.cache/yarn \
	yarn install --frozen-lockfile
RUN yarn run typecheck
RUN yarn run lint

COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]
