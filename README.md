# Travel Photo Album

A self-hosted photo and video browser for large travel archives, built with Next.js App Router and backed by lazy thumbnail generation, metadata extraction, geolocation enrichment, perceptual hashing, and full-library search.

It is designed for real folders on disk rather than an imported asset database: point a collection at an existing media root, browse by folder and day, open photos or videos in a rich lightbox, inspect EXIF and derived metadata, and backfill missing data incrementally with queue workers.

## Contents

- [Why this project exists](#why-this-project-exists)
- [Highlights](#highlights)
- [Screenshot placeholders](#screenshot-placeholders)
- [Architecture at a glance](#architecture-at-a-glance)
- [Feature tour](#feature-tour)
- [Getting started](#getting-started)
- [Optional services with Docker](#optional-services-with-docker)
- [Core workflows](#core-workflows)
- [Validation](#validation)
- [Repository layout](#repository-layout)
- [Operational notes](#operational-notes)
- [Troubleshooting](#troubleshooting)
- [Roadmap ideas](#roadmap-ideas)

## Why this project exists

Travel archives tend to sprawl across years, cameras, phones, exported albums, drones, and NAS shares. This app gives that archive a usable interface without forcing a one-time ingestion step:

- **Browse by collection, folder, and day**
- **Generate thumbnails and metadata on demand**
- **Open photos and videos in a single viewer**
- **Inspect EXIF plus derived metadata in a sidebar**
- **Search by generated descriptions and detected cities**
- **Queue heavy work into background workers instead of blocking page loads**

## Highlights

| Capability | What it does |
| --- | --- |
| Collection browser | Uses `config.json` as the source of truth for mounted travel collections. |
| Folder + day navigation | Recursively browses folders, groups media by day, and opens each day as a gallery. |
| Fast previews | Serves thumbnails from `thumbPath` or Kvrocks and upgrades to larger media in the lightbox. |
| Mixed media support | Handles both photos and videos in the gallery and single-item viewer. |
| Rich metadata | Shows EXIF, computed dimensions, description, dominant color, GPS, city, and pHash. |
| Search | Search infrastructure is prepared for a Typesense-backed description and location index across collections. |
| Background processing | Uses BullMQ workers for thumbnail, metadata, and description jobs. |
| Operational scripts | Includes warmup, queue scan, geolocation backfill, pHash backfill, and search indexing scripts. |

## Screenshot placeholders

Drop final screenshots into `docs/screenshots/` and replace the placeholder notes below with real images.

| Placeholder path | What to capture |
| --- | --- |
| `docs/screenshots/01-home-overview.png` | Main home screen with collection picker, current path, folder tree, and day timeline. |
| `docs/screenshots/02-folder-navigation.png` | Recursive folder navigation expanded several levels deep. |
| `docs/screenshots/03-day-gallery.png` | Single day gallery with grouped similar shots and pHash badges. |
| `docs/screenshots/04-lightbox-photo.png` | Large photo lightbox showing the immediate thumbnail preview before the full-size asset loads. |
| `docs/screenshots/05-lightbox-video.png` | Video playback in the lightbox with poster frame and controls. |
| `docs/screenshots/06-metadata-sidebar.png` | EXIF sidebar with description, dominant color, city, GPS, dimensions, and raw metadata details. |
| `docs/screenshots/07-search-results.png` | Search results page showing grouped matching days and preview grids. |
| `docs/screenshots/08-queue-status.png` | Queue progress widget during thumbnail and metadata processing. |
| `docs/screenshots/09-error-details.png` | Detailed fetch failure state with request URL, status, and retry button. |

## Architecture at a glance

### Frontend

- `app/page.tsx` loads normalized collection config on the server.
- `app/_components/` contains the client UI: header, folder tree, timeline, day gallery, lightbox, metadata sidebars, and queue widget.
- `app/search/page.tsx` exposes cross-library search for descriptions and city names.

### API routes

Route handlers in `app/api/**` are thin adapters over the filesystem and metadata helpers:

- `/api/files` lists folders and files for navigation
- `/api/dates` groups visible files by day and returns location summaries
- `/api/filesByDate` returns media for a single day
- `/api/photo` streams original assets
- `/api/thumb` serves or generates thumbnails
- `/api/meta` returns normalized metadata plus the raw stored metadata entry
- `/api/info`, `/api/folder-info`, and `/api/queue-info` power sidebars and ops widgets

### Storage model

- **Original media** stays on your existing filesystem or NAS
- **Collection definitions** live in `config.json`
- **Thumbnail blobs / directory metadata** live in `thumbPath` folders or Kvrocks
- **BullMQ queue state** lives in Redis and is persisted locally in `./redis`
- **Search engine** runs in Typesense over HTTP on port `8108` when Docker services are enabled

### Workers

- `scripts/media-worker.ts` handles thumbnails, EXIF, and metadata persistence
- `scripts/description-worker.ts` handles image description generation on a separate queue

## Feature tour

### 1. Browse by trip, folder, and day

Collections come from `config.json`. Each section is exposed by its array index, so collection order matters. The UI lets you:

- choose a collection from the header
- open nested folders from the left sidebar
- browse media grouped by date
- jump straight into a day-level gallery

### 2. Open a media-aware lightbox

The shared lightbox supports:

- photo viewing with thumbnail-first progressive loading
- video playback with poster frames and controls
- previous/next navigation
- footer editing flows such as description updates
- an EXIF button that opens the metadata sidebar

### 3. Inspect rich metadata

Metadata is not limited to raw EXIF. The sidebar surfaces:

- stored EXIF payload
- computed width and height
- dominant color
- generated or stored description
- GPS coordinates
- reverse-geocoded city / locality
- perceptual hash (`pHash`)

### 4. Search across the archive

The search page groups matches by day and folder so you can find:

- places based on city names derived from GPS
- moments based on generated image descriptions
- visually inspect matching days before opening them

### 5. Group similar photos

Within a day, similar images can be grouped using perceptual hashes so burst shots or near-duplicates do not dominate the timeline.

## Getting started

### Prerequisites

- Node.js 20+ recommended
- npm
- access to the media folders referenced by `config.json`
- optional: Docker Desktop for Typesense, Kvrocks, Redis, and worker containers
- optional: `ffmpeg` for video thumbnail generation workflows

### 1. Install dependencies

```bash
npm install
```

### 2. Configure collections

Edit `config.json` to point at your media roots.

Example:

```json
{
  "sections": [
    {
      "name": "P:/Photos",
      "linuxPath": "/media/nas/photo/Photos",
      "macPath": "/Volumes/photo/Photos",
      "winPath": "P:/Photos",
      "thumbPath": "./data/synology-photos"
    }
  ]
}
```

Notes:

- `macPath`, `linuxPath`, and `winPath` are normalized by `lib/config.ts`
- `thumbPath` is optional; without it, thumbnails and metadata can be stored in Kvrocks
- `from` and `till` can limit the visible root-range within a collection

### 3. Configure environment variables

```bash
cp .env.example .env
cp .env.example .env.local
```

Important defaults from `.env.example`:

- `REDIS_URL` and `THUMB_KV_URL` target Kvrocks on port `6666`
- `BULLMQ_REDIS_URL` and `THUMB_QUEUE_URL` target Redis on port `6379`
- `TYPESENSE_PROTOCOL`, `TYPESENSE_HOST`, `TYPESENSE_PORT`, `TYPESENSE_API_KEY`, and `TYPESENSE_COLLECTION` define the default search endpoint for the app
- `*_TYPESENSE_*` overrides point Docker workers and the indexer at the internal `typesense` service on the compose network
- `TYPESENSE_HEALTH_TIMEOUT_SECONDS` controls how long the Docker indexer waits for Typesense to become ready
- `BULLMQ_WORKER_LOCK_DURATION_MS` controls how long the media worker keeps a BullMQ job lock before renewal; increase it for very slow thumbnail or metadata jobs
- `DESCRIPTION_WORKER_LOCK_DURATION_MS` controls how long the description worker keeps a BullMQ job lock before renewal; increase it for slow Ollama caption jobs
- `DESCRIPTION_QUEUE_URL` controls the dedicated description queue
- `OLLAMA_BASE_URL` and `OLLAMA_MODEL` control auto-generated descriptions
- `DESCRIPTION_WORKER_OLLAMA_BASE_URL` defaults the Docker description worker to `http://host.docker.internal:11434` so it can use Ollama running on the host
- `DESCRIPTION_WORKER_EMBEDDED_OLLAMA=1` re-enables the fallback Ollama daemon inside the `description-worker` container if you need it
- `MEDIA_ROOT_HOST_PATH` maps your host media path into Docker worker containers

### 4. Start the app

```bash
npm run dev
```

Then open <http://localhost:3000>.

## Optional services with Docker

Bring up the local services and workers:

```bash
docker compose up -d typesense kvrocks redis media-worker description-worker search-indexer
```

What each service does:

- `typesense`: HTTP search engine for indexed descriptions and locations, persisted in the named `typesense_data` volume
- `kvrocks`: folder cache and thumbnail/blob metadata storage
- `redis`: BullMQ queue backend, persisted in `./redis`
- `media-worker`: background thumbnails, metadata, EXIF, and related processing
- `description-worker`: automatic image descriptions using Ollama on a separate queue
- `search-indexer`: runs `npm run index:search` on a loop (hourly by default) and is pre-wired with `TYPESENSE_*` settings on the compose network

Useful watch commands during development:

```bash
docker compose watch kvrocks
docker compose watch media-worker
docker compose watch description-worker
docker compose watch search-indexer
```

By default the Docker `description-worker` talks to **host Ollama** via `host.docker.internal`, which lets macOS use Metal/GPU acceleration outside Docker. The image still contains the fallback embedded Ollama path; set `DESCRIPTION_WORKER_EMBEDDED_OLLAMA=1` if you want the container to start its own Ollama daemon instead.

## Core workflows

### Warm an entire collection

Recursively scan one collection and enqueue work for all nested folders:

```bash
npm run warmup:thumbs -- 5
npm run warmup:thumbs -- "P:/Photos"
```

Optional flags:

- `--force`
- `--force-rotated`

### Queue a full collection scan

```bash
npm run queue:scan -- 5
docker compose run --rm media-worker npm run queue:scan -- 5
```

### Run the workers directly

```bash
npm run worker:media
npm run worker:description
```

### Backfill geolocation from stored GPS

```bash
npm run index:geolocation
npm run index:geolocation -- --force
```

This scans stored metadata in Kvrocks and fills in reverse-geocoded city information where possible.

### Backfill missing perceptual hashes from stored thumbnails

```bash
npm run index:phash -- 5
npm run index:phash -- "P:/Photos" --force
```

This script:

- scans the collection directory tree to discover files
- reads existing stored thumbnails only
- computes missing pHashes from those thumbnails
- writes the resulting hash back into stored metadata

### Build the search index

```bash
npm run index:search
npm run index:search -- --section 5
npm run index:search -- --section "P:/Photos"
```

To rebuild automatically in Docker, run the `search-indexer` service. It executes `npm run index:search`
on a loop, waits for Typesense health first, and receives `TYPESENSE_*` connection settings over the
compose network.

The application-side search/index implementation still uses the existing SQLite helpers today; this
infrastructure change only swaps the Docker/bootstrap defaults over to a networked Typesense service.

Set `SEARCH_INDEX_INTERVAL_SECONDS` in `.env` to change the schedule. The default is `3600`
seconds (once per hour).

## Validation

Use these commands to validate changes:

```bash
docker compose config --quiet
npm run typecheck
npm run build
```

`npm run lint` is currently stale because the repo still points to `next lint`, which is no longer provided by Next.js 16, and the ESLint config has not yet been migrated to the flat config format required by ESLint 10.

## Repository layout

```text
app/
  api/                 Next.js route handlers
  _components/         Colocated client UI
  search/              Search results page
lib/
  config.ts            Platform-aware collection config normalization
  files.ts             Filesystem helpers and date extraction
  file-meta.ts         Metadata, GPS, and pHash helpers
  thumb-store.ts       Thumbnail/blob storage access
  search-index.ts      Search indexing helpers (currently SQLite-backed in app code)
scripts/
  warmup-thumbnails.ts
  enqueue-collection-scan.ts
  media-worker.ts
  description-worker.ts
  index-geolocation.ts
  index-phash.ts
  index-search.ts
data/                  Generated local artifacts
kvrocks/               Local Kvrocks persistence
redis/                 Local Redis persistence
```

## Operational notes

- `config.json` section order is part of the public API because the array index becomes the `sectionId`
- `lib/files.ts#getFileDate()` extracts `YYYYMMDD` from filenames before falling back to filesystem timestamps
- API payload shapes are intentionally stable because the client expects fields such as `{ files }`, `{ dates }`, and `COMPUTED.Width`
- `data/` is ignored and safe for generated local artifacts
- Redis automatically reloads `dump.rdb` from `./redis` on startup
- Typesense persists its search data in the named Docker volume `typesense_data`

## Troubleshooting

### Thumbnails or metadata are missing

- confirm the collection path in `config.json`
- verify Kvrocks and Redis connectivity if you use queue-backed storage
- run `npm run warmup:thumbs -- <collection>`
- ensure `media-worker` is running for queued jobs

### Search returns no results

- make sure descriptions or city metadata exist
- run `npm run index:search`
- verify the app or worker can reach `http://127.0.0.1:8108` locally, or `http://typesense:8108` from Docker services
- if using generated descriptions, ensure the description worker and Ollama are configured

### pHash is missing

- make sure thumbnails already exist
- run `npm run index:phash -- <collection-id-or-name>`

### Docker storage keeps disappearing

- Redis is bind-mounted to `./redis`
- Kvrocks is bind-mounted to `./kvrocks`
- Typesense search data lives in the named `typesense_data` volume

## Roadmap ideas

- screenshot gallery in the README once assets are captured
- richer map-based browsing
- batch metadata editing
- smarter duplicate review workflows
- flat-config ESLint migration

## License

Add your preferred license here.
