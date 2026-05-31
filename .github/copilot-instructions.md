# Copilot Instructions

## Build, test, and lint commands

- `npm run dev` starts the Next.js app in development mode.
- `npm run build` creates the production build.
- `npm run start` serves the production build.
- `npm run typecheck` runs `tsc --noEmit` and is the supported TypeScript validation command.
- `npm run lint` is currently stale: it still runs `next lint`, but Next.js 16 no longer exposes that command. Running `npx eslint .` also fails because the repository still uses legacy `.eslintrc.json` config instead of the ESLint flat-config format required by ESLint 10.
- There is no automated test runner configured in the root `package.json`, so there is no full-suite or single-test command to use. The `test/` directory contains ad-hoc scripts, not CI-style tests:
  - `node test/queue-processor.ts` drains queued BullMQ media jobs once for local debugging.
  - `node test/recache.js` is a local-only cache experiment with hard-coded photo paths.

## High-level architecture

- This is a Next.js **App Router** app. `app/page.tsx` reads normalized section data from `lib/config.ts` on the server and passes `config.sections` into the colocated client UI under `app/_components/`.
- The main UI flow is query-string driven:
  - `section` selects an entry from `config.sections`
  - `folder` selects a nested folder within that section
  - `app/_components/nav/section-folders.tsx` recursively loads folder data from `/api/files/...`
  - `app/_components/gallery.tsx` loads grouped dates from `/api/dates/...`
  - `app/_components/gallery-one-day.tsx` loads files for a single date from `/api/filesByDate/...` and then fetches per-file metadata from `/api/meta/...`
- The route handlers in `app/api/**` are thin filesystem adapters over helpers in `lib/files.ts`:
  - `/api/files` lists directories/files for navigation
  - `/api/dates` groups visible files by day
  - `/api/filesByDate` returns the files for one day
  - `/api/photo` streams the original asset
  - `/api/thumb` serves or generates thumbnails
  - `/api/meta` returns normalized metadata plus the raw stored metadata entry used by the EXIF sidebar
- Thumbnail and metadata generation are lazy and queue-backed:
  - `/api/thumb` looks in `section.thumbPath` first, then tries alternate thumbnail formats, then generates new thumbnails with `sharp` or ffmpeg
  - `/api/meta` prefers `meta.json` next to the thumbnails; if none exists, it reads the original file and enqueues a BullMQ job via `lib/thumb-queue.ts`
  - `scripts/warmup-thumbnails.ts` warms thumbnails for an entire collection recursively from a single config entry
  - `scripts/enqueue-collection-scan.ts` enqueues media work for a collection, `scripts/index-geolocation.ts` backfills locality metadata, and `scripts/index-phash.ts` backfills missing perceptual hashes from stored thumbnails only
  - `scripts/media-worker.ts` processes thumbnail and metadata jobs, while `scripts/description-worker.ts` handles automatic image descriptions on its separate queue

## Key conventions

- `config.json` is operational data, not just static config. Each section's **array index** is the public `sectionId` used by the page and by all catch-all API routes, so reordering sections changes route behavior.
- `lib/config.ts` resolves `macPath`, `linuxPath`, or `winPath` into `section.path` based on `process.platform`. Read sections through that helper instead of importing `config.json` directly in server code.
- Reuse `joinSectionPath()` from `lib/files.ts` for filesystem paths. It centralizes `path.posix` joining and the Windows UNC remapping for `/media/nas/photo/...`.
- Preserve current API payload shapes. The client code expects responses like `{ files }`, `{ dates }`, and metadata objects that expose `COMPUTED.Width` / `COMPUTED.Height`.
- Photo grouping depends on `getFileDate()` in `lib/files.ts`: it extracts `YYYYMMDD` from the filename before falling back to filesystem timestamps. Changing filename handling changes date buckets in the gallery.
- `section.from` and `section.till` in `config.json` are applied after directory enumeration to clip the visible range of files inside a section.
- `data/` remains an ignored working directory for generated artifacts such as the SQLite search index. Thumbnail storage lives either next to media in `section.thumbPath` or in Kvrocks, and BullMQ queue state lives in the repo-local `redis/` folder.
- The repository mixes `.js` and `.mjs`. Match the module format already used by the file you are editing instead of normalizing imports/exports as an unrelated cleanup.
