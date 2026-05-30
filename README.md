This is a [Next.js](https://nextjs.org/) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

### Optional Kvrocks cache, Redis queue, BullMQ worker, and thumbnail store

Folder listings used by `/api/files/...` can be cached in Kvrocks during local development, generated thumbnails for sections without `thumbPath` are persisted there, and BullMQ jobs can now be drained by a dedicated permanent worker.
BullMQ now uses a dedicated Redis instance, while Kvrocks remains available for the folder cache and thumbnail blob store.
Set `REDIS_FOLDER_CACHE_TTL_SECONDS=0` to keep cached entries forever.

```bash
cp .env.example .env.local
cp .env.example .env
docker compose up -d kvrocks redis media-worker
```

The scanner and worker scripts (`warmup:thumbs`, `queue:scan`, `worker:media`) load `.env` automatically via `dotenv`, so queue/cache settings apply even when you run them directly with `npm run ...`.

The worker container expects the media root to be mounted at the same Linux path used by `config.json` (defaults to `/media/nas/photo` inside the container). On macOS/Docker Desktop the host path now defaults to `/Volumes/photo`; override `MEDIA_ROOT_HOST_PATH` in `.env` if your library is mounted somewhere else, and make sure that host path is shared with Docker.

By default:

- `REDIS_URL` and `THUMB_KV_URL` point at Kvrocks on port `6666`
- `THUMB_QUEUE_URL` and `BULLMQ_REDIS_URL` point at the dedicated Redis container on port `6379`
- `MEDIA_WORKER_*` overrides are available if the worker container needs different in-network URLs than your local host setup

Restart Kvrocks automatically when its critical config changes:

```bash
docker compose watch kvrocks
```

Scan an entire collection locally and enqueue thumbnail jobs for all nested folders:

```bash
npm run warmup:thumbs -- 5
npm run warmup:thumbs -- "P:/Photos"
```

`npm run warmup:thumbs` and `npm run queue:scan` both enqueue jobs only; the actual thumbnail and metadata processing now happens in the BullMQ worker.

You can also queue an entire collection from inside the worker container:

```bash
npm run queue:scan -- 5
docker compose run --rm media-worker npm run queue:scan -- 5
```

The permanent worker entrypoint is `npm run worker:media`, and `node test/queue-processor.ts` is available as a one-shot queue drainer for local debugging.

You can start editing the main gallery UI in `app/page.tsx` and the colocated client components under `app/_components/`. The page auto-updates as you edit the file.

[Route handlers](https://nextjs.org/docs/app/building-your-application/routing/route-handlers) can be accessed on [http://localhost:3000/api/hello](http://localhost:3000/api/hello). This endpoint can be edited in `app/api/hello/route.ts`.

The `app/api` directory is mapped to `/api/*`. Files in this directory are treated as [route handlers](https://nextjs.org/docs/app/building-your-application/routing/route-handlers).

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js/) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/deployment) for more details.
