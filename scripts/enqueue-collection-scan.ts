// @ts-nocheck
import "../lib/system/load-env.ts";
import fs from "fs/promises";
import process from "process";
import invariant from "tiny-invariant";
import { closeRedisClient } from "../lib/system/cache.ts";
import config from "../lib/config/config.ts";
import {
	closeDescriptionQueue,
	validateDescriptionQueueConnection,
} from "../lib/media/description-queue.ts";
import {
	descriptionJobActions,
	isDescriptionQueueConfigured,
} from "../lib/media/description-jobs.ts";
import { isHiddenPathSegment, joinSectionPath } from "../lib/media/files.ts";
import { storeFolderListing } from "../lib/media/folder-store.ts";
import { getSectionById, getSectionIndex } from "../lib/api/api-route.ts";
import {
hasExifOrientationTransform,
normalizeStoredDescription,
readStoredMetaForFile,
} from "../lib/media/file-meta.ts";
import {
buildMediaJobId,
createMediaQueue,
getEnsureSectionThumbVariant,
mediaJobNames,
} from "../lib/media/media-worker.ts";
import { serializeSectionForWorker } from "../lib/media/thumb-jobs.ts";
import { validateBullMqConnection } from "../lib/media/thumb-queue.ts";
import {
	closeThumbKvClient,
	hasStoredSectionThumb,
	isSupportedMediaPath,
	isVideoPath,
} from "../lib/media/thumb-store.ts";

const batchSize = 250;

async function main() {
const startedAt = Date.now();
const { collectionInput, force, forceRotated } = parseArgs(process.argv.slice(2));
if (!collectionInput) {
console.log("Usage: npm run queue:scan -- <collection-name> [--force] [--force-rotated]");
return;
}

const section = getSectionById(config.sections, collectionInput);
invariant(section, `section not found: ${collectionInput}`);
const sectionId = getSectionIndex(config.sections, section);
invariant(section.path, "section.path");
console.log(`Resolved collection: ${section.name}`);
console.log(`Root path: ${section.path}`);
const queue = createMediaQueue();
let descriptionQueue = null;
console.log("Validating BullMQ connection...");
await validateBullMqConnection(queue, mediaJobNames.warmSectionFile);
if (isDescriptionQueueConfigured()) {
	descriptionQueue = await validateDescriptionQueueConnection();
}
console.log("BullMQ connection OK.");
console.log("Scanning folders recursively...");

const scanStats = { directories: 0, files: 0 };
let enqueued = 0;
let skipped = 0;
const batchEntries = [];
const descriptionBatchEntries = [];
const variant = getEnsureSectionThumbVariant({});

await scanCollectionFiles(section, [], scanStats, async (filePath) => {
if (!isSupportedMediaPath(filePath)) {
skipped += 1;
return;
}
const indexState = await getIndexState(sectionId, section, filePath, variant, force, forceRotated);
if (!indexState.shouldEnqueue) {
skipped += 1;
return;
}
const payload = {
sectionId,
section: serializeSectionForWorker(section),
filePath,
variant,
force: indexState.force,
};
const targetBatch =
indexState.reason === "missing-description" ? descriptionBatchEntries : batchEntries;
const targetName =
indexState.reason === "missing-description"
	? descriptionJobActions.generateImageDescription
	: mediaJobNames.warmSectionFile;
const targetPrefix = indexState.reason === "missing-description" ? "description" : "thumb";
targetBatch.push({
name: targetName,
data: {
	...(indexState.reason === "missing-description"
		? { action: descriptionJobActions.generateImageDescription }
		: {}),
	...payload,
},
opts: {
	jobId: `${targetPrefix}:${targetName}:${buildMediaJobId(targetName, payload)}`,
},
});
if (batchEntries.length >= batchSize) {
await flushBatch(queue, batchEntries, {
	enqueued,
	skipped,
	scanned: scanStats.files,
	label: "warmup",
});
enqueued += batchEntries.length;
batchEntries.length = 0;
}
if (descriptionQueue && descriptionBatchEntries.length >= batchSize) {
await flushBatch(descriptionQueue, descriptionBatchEntries, {
	enqueued,
	skipped,
	scanned: scanStats.files,
	label: "description",
});
enqueued += descriptionBatchEntries.length;
descriptionBatchEntries.length = 0;
}
});

await flushBatch(queue, batchEntries, {
enqueued,
skipped,
scanned: scanStats.files,
label: "warmup",
});
enqueued += batchEntries.length;
batchEntries.length = 0;
if (descriptionQueue) {
await flushBatch(descriptionQueue, descriptionBatchEntries, {
	enqueued,
	skipped,
	scanned: scanStats.files,
	label: "description",
});
enqueued += descriptionBatchEntries.length;
descriptionBatchEntries.length = 0;
}

await queue.close();
await closeDescriptionQueue();
console.log(
`Scan complete: ${scanStats.directories} director${scanStats.directories === 1 ? "y" : "ies"}, ${scanStats.files} candidate files`,
);
console.log(
`Queued ${enqueued} warmup jobs (${skipped} skipped) in ${formatDuration(Date.now() - startedAt)}`,
);
}

function parseArgs(args) {
const force = args.includes("--force");
const forceRotated = args.includes("--force-rotated");
const collectionInput = args.find(
(argument) =>
argument !== "--force" &&
argument !== "--force-rotated" &&
argument !== "--help" &&
argument !== "-h",
);
return { collectionInput, force, forceRotated };
}

async function getIndexState(sectionId, section, filePath, variant, force, forceRotated) {
if (force) {
return { shouldEnqueue: true, reason: "force", force: true };
}

if (forceRotated && !isVideoPath(filePath)) {
const shouldReindexRotated = await hasExifOrientationTransform(section, filePath);
if (shouldReindexRotated) {
return { shouldEnqueue: true, reason: "force-rotated", force: true };
}
}

const [hasThumb, storedMeta] = await Promise.all([
hasStoredSectionThumb(section, filePath, variant),
readStoredMetaForFile(section, filePath),
]);
const hasDescription = Boolean(normalizeStoredDescription(storedMeta?.description));
const needsDescription =
	!isVideoPath(filePath) && isDescriptionQueueConfigured() && !hasDescription;

if (hasThumb && storedMeta && !needsDescription) {
return { shouldEnqueue: false, reason: "already-indexed", force: false };
}

if (!hasThumb && !storedMeta) {
return { shouldEnqueue: true, reason: "missing-thumb-and-metadata", force: false };
}

if (needsDescription) {
return { shouldEnqueue: true, reason: "missing-description", force: false };
}

return {
shouldEnqueue: true,
reason: hasThumb ? "missing-metadata" : "missing-thumbnail",
force: false,
};
}

async function scanCollectionFiles(section, rootSegments, scanStats, onFile) {
const entries = await readDirectoryEntries(section, rootSegments);
const boundedEntries = applySectionBounds(entries, section, rootSegments);
scanStats.directories += 1;

await storeFolderListing(section, rootSegments, boundedEntries);

for (const entry of boundedEntries) {
const nextPath = [...rootSegments, entry.name];
if (entry.isDirectory()) {
await scanCollectionFiles(section, nextPath, scanStats, onFile);
continue;
}
if (entry.isFile()) {
scanStats.files += 1;
await onFile(nextPath, scanStats.files);
}
}
}

async function flushBatch(queue, batchEntries, stats) {
if (!batchEntries.length) {
return;
}
await queue.addBulk(batchEntries);
console.log(
	`enqueued ${stats.enqueued + batchEntries.length} ${stats.label} jobs (${stats.scanned} scanned, ${stats.skipped} skipped)`,
);
}

async function readDirectoryEntries(section, pathSegments) {
const directoryPath = joinSectionPath(section.path, pathSegments);
const entries = await fs.readdir(directoryPath, { withFileTypes: true });
return entries
.filter((entry) => !isHiddenPathSegment(entry.name))
.sort((firstEntry, secondEntry) =>
firstEntry.name.localeCompare(secondEntry.name, undefined, {
numeric: true,
sensitivity: "base",
}),
);
}

function applySectionBounds(entries, section, pathSegments) {
if (pathSegments.length > 0) {
return entries;
}

let boundedEntries = entries;
if (section.from) {
const startIndex = boundedEntries.findIndex((entry) => entry.name === section.from);
if (startIndex >= 0) {
boundedEntries = boundedEntries.slice(startIndex);
}
}
if (section.till) {
const endIndex = boundedEntries.findIndex((entry) => entry.name === section.till);
if (endIndex >= 0) {
boundedEntries = boundedEntries.slice(0, endIndex + 1);
}
}
return boundedEntries;
}

function formatDuration(durationMs) {
const totalSeconds = Math.round(durationMs / 1000);
const minutes = Math.floor(totalSeconds / 60);
const seconds = totalSeconds % 60;
return `${minutes}m ${seconds}s`;
}

main()
.catch((error) => {
console.error(error instanceof Error ? error.message : String(error));
process.exitCode = 1;
})
.finally(async () => {
await Promise.allSettled([closeThumbKvClient(), closeRedisClient()]);
});
