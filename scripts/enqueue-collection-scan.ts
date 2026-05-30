// @ts-nocheck
import "../lib/load-env.ts";
import fs from "fs/promises";
import mime from "mime-types";
import process from "process";
import invariant from "tiny-invariant";
import { closeRedisClient } from "../lib/cache.ts";
import config from "../lib/config.ts";
import { joinSectionPath } from "../lib/files.ts";
import {
buildMediaJobId,
createMediaQueue,
getEnsureSectionThumbVariant,
mediaJobNames,
} from "../lib/media-worker.ts";
import { serializeSectionForWorker } from "../lib/thumb-jobs.ts";
import { validateBullMqConnection } from "../lib/thumb-queue.ts";
import { closeThumbKvClient, isVideoPath } from "../lib/thumb-store.ts";

const batchSize = 250;

async function main() {
const startedAt = Date.now();
const [collectionInput] = process.argv.slice(2);
if (!collectionInput || collectionInput === "--help" || collectionInput === "-h") {
console.log("Usage: npm run queue:scan -- <collection-id-or-name>");
return;
}

const sectionId = resolveCollectionId(collectionInput);
const section = config.sections?.[sectionId];
invariant(section, "section not found");
invariant(section.path, "section.path");
console.log(`Resolved collection ${sectionId}: ${section.name}`);
console.log(`Root path: ${section.path}`);
const queue = createMediaQueue();
console.log("Validating BullMQ connection...");
await validateBullMqConnection(queue, mediaJobNames.warmSectionFile);
console.log("BullMQ connection OK.");
console.log("Scanning folders recursively...");

const scanStats = { directories: 0, files: 0 };
let enqueued = 0;
let skipped = 0;
const batchEntries = [];

await scanCollectionFiles(section, [], scanStats, async (filePath) => {
const fullPath = joinSectionPath(section.path, filePath);
const mimeType = mime.lookup(fullPath) || "";
const isMedia = mimeType.startsWith("image/") || isVideoPath(filePath);
if (!isMedia) {
skipped += 1;
return;
}
const payload = {
sectionId,
section: serializeSectionForWorker(section),
filePath,
variant: getEnsureSectionThumbVariant({}),
};
batchEntries.push({
name: mediaJobNames.warmSectionFile,
data: payload,
opts: {
jobId: `thumb:${mediaJobNames.warmSectionFile}:${buildMediaJobId(mediaJobNames.warmSectionFile, payload)}`,
},
});
if (batchEntries.length >= batchSize) {
await flushBatch(queue, batchEntries, {
enqueued,
skipped,
scanned: scanStats.files,
});
enqueued += batchEntries.length;
batchEntries.length = 0;
}
});

await flushBatch(queue, batchEntries, {
enqueued,
skipped,
scanned: scanStats.files,
});
enqueued += batchEntries.length;
batchEntries.length = 0;

await queue.close();
console.log(
`Scan complete: ${scanStats.directories} director${scanStats.directories === 1 ? "y" : "ies"}, ${scanStats.files} candidate files`,
);
console.log(
`Queued ${enqueued} warmup jobs (${skipped} skipped) in ${formatDuration(Date.now() - startedAt)}`,
);
}

function resolveCollectionId(collectionInput) {
if (/^\d+$/.test(collectionInput)) {
const sectionId = Number(collectionInput);
invariant(Number.isInteger(sectionId), "collection id must be an integer");
invariant(config.sections?.[sectionId], "section not found");
return sectionId;
}

const normalizedInput = collectionInput.trim().toLowerCase();
const sectionId = config.sections.findIndex(
(section) => section?.name?.trim().toLowerCase() === normalizedInput,
);
invariant(sectionId >= 0, `section not found: ${collectionInput}`);
return sectionId;
}

async function scanCollectionFiles(section, rootSegments, scanStats, onFile) {
const entries = await readDirectoryEntries(section, rootSegments);
const boundedEntries = applySectionBounds(entries, section, rootSegments);
scanStats.directories += 1;

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
`enqueued ${stats.enqueued + batchEntries.length} warmup jobs (${stats.scanned} scanned, ${stats.skipped} skipped)`,
);
}

async function readDirectoryEntries(section, pathSegments) {
const directoryPath = joinSectionPath(section.path, pathSegments);
const entries = await fs.readdir(directoryPath, { withFileTypes: true });
return entries.sort((firstEntry, secondEntry) =>
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
