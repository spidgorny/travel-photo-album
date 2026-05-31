This is a [Next.js](https://nextjs.org/) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

### Optional Kvrocks cache, Redis queues, BullMQ workers, thumbnail store, and Ollama captions

Folder listings used by `/api/files/...` can be cached in Kvrocks during local development, generated thumbnails for sections without `thumbPath` are persisted there, and BullMQ jobs can now be drained by a dedicated permanent worker.
BullMQ now uses a dedicated Redis instance, while Kvrocks remains available for the folder cache and thumbnail blob store.
Set `REDIS_FOLDER_CACHE_TTL_SECONDS=0` to keep cached entries forever.
Redis queue data is now bind-mounted into the repository `redis/` folder so it survives Docker volume cleanup.

```bash
cp .env.example .env.local
cp .env.example .env
docker compose up -d kvrocks redis media-worker description-worker
```

The scanner and worker scripts (`warmup:thumbs`, `queue:scan`, `worker:media`, `worker:description`) load `.env` automatically via `dotenv`, so queue/cache settings apply even when you run them directly with `npm run ...`.

The worker container expects the media root to be mounted at the same Linux path used by `config.json` (defaults to `/media/nas/photo` inside the container). On macOS/Docker Desktop the host path now defaults to `/Volumes/photo`; override `MEDIA_ROOT_HOST_PATH` in `.env` if your library is mounted somewhere else, and make sure that host path is shared with Docker.

By default:

- `REDIS_URL` is used for the folder cache and should point at Kvrocks on port `6666`
- `THUMB_KV_URL` is used for thumbnail/blob metadata storage and should point at Kvrocks on port `6666`
- `THUMB_QUEUE_URL` and `BULLMQ_REDIS_URL` point at the dedicated Redis container on port `6379`
- `DESCRIPTION_QUEUE_URL` / `DESCRIPTION_QUEUE_NAME` let caption generation run on a separate BullMQ queue from thumbnail warmup
- `OLLAMA_BASE_URL` and `OLLAMA_MODEL` control automatic image descriptions; the Docker `description-worker` service starts its own Ollama daemon, bootstraps the Ollama binary on first start, and uses `DESCRIPTION_WORKER_OLLAMA_BASE_URL`
- `MEDIA_WORKER_*` and `DESCRIPTION_WORKER_*` overrides are available if the worker containers need different in-network URLs than your local host setup

Restart Kvrocks automatically when its critical config changes:

```bash
docker compose watch kvrocks
```

Sync worker code changes into the container and restart it automatically:

```bash
docker compose watch media-worker
docker compose watch description-worker
```

Scan an entire collection locally and enqueue thumbnail jobs for all nested folders:

```bash
npm run warmup:thumbs -- 5
npm run warmup:thumbs -- "P:/Photos"
```

`npm run warmup:thumbs` and `npm run queue:scan` both enqueue jobs only; thumbnail/metadata work runs in `worker:media`, while description generation runs in `worker:description`.

Description jobs use their own BullMQ queue (`DESCRIPTION_QUEUE_NAME`, default
`description-jobs`) and their own worker concurrency (`DESCRIPTION_WORKER_CONCURRENCY`,
default `1`), so caption generation does not block thumbnail warmup. Set `OLLAMA_MODEL`
to a vision-capable model that your Ollama instance can run; the bundled `description-worker`
container bootstraps the Ollama binary on first start, runs `ollama serve`, pulls that model,
and then drains the description queue. Rerun `npm run warmup:thumbs -- <collection>` to
backfill missing image descriptions. Existing manual descriptions are preserved.

You can also queue an entire collection from inside the worker container:

```bash
npm run queue:scan -- 5
docker compose run --rm media-worker npm run queue:scan -- 5
```

The permanent worker entrypoints are `npm run worker:media` for thumbs/EXIF/meta and
`npm run worker:description` for Ollama descriptions. `node test/queue-processor.ts` is
available as a one-shot queue drainer for local debugging.

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
