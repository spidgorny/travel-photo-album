FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update \
&& apt-get install -y --no-install-recommends ffmpeg \
&& rm -rf /var/lib/apt/lists/*

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

COPY . .

CMD ["npm", "run", "worker:media"]
