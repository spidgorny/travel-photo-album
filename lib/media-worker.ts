// @ts-nocheck
import crypto from "crypto";
import { Queue } from "bullmq";
import invariant from "tiny-invariant";
import config from "./config.ts";
import { buildImageMetaData, writeStoredMetaForFile } from "./file-meta.ts";
import {
thumbJobActions,
thumbQueueName,
thumbQueuePrefix,
thumbQueueUrl,
} from "./thumb-jobs.ts";
import {
ensureSectionThumb,
getMediaKind,
isVideoPath,
thumbnailTargetWidth,
} from "./thumb-store.ts";

const defaultWorkerConcurrency = 2;
const legacyEnsureSectionThumbJobName = "ensure-section-thumb";

export const mediaQueueName = thumbQueueName;
export const mediaQueuePrefix = thumbQueuePrefix;

export const mediaJobNames = {
getMetaForFile: thumbJobActions.getMetaForFile,
storeMetaForVideo: thumbJobActions.storeMetaForVideo,
warmSectionFile: thumbJobActions.warmSectionFile,
legacyEnsureSectionThumb: legacyEnsureSectionThumbJobName,
} as const;

export function getMediaRedisUrl() {
const redisUrl =
thumbQueueUrl ||
process.env.BULLMQ_REDIS_URL?.trim() ||
process.env.THUMB_KV_URL?.trim() ||
process.env.REDIS_URL?.trim();
invariant(
redisUrl,
"Set THUMB_QUEUE_URL or BULLMQ_REDIS_URL before starting the worker",
);
return redisUrl;
}

export function getWorkerConcurrency() {
const parsedConcurrency = Number(
process.env.BULLMQ_WORKER_CONCURRENCY ?? defaultWorkerConcurrency,
);
return Number.isInteger(parsedConcurrency) && parsedConcurrency > 0
? parsedConcurrency
: defaultWorkerConcurrency;
}

export function getMediaQueueConnection() {
const redisUrl = new URL(getMediaRedisUrl());
const dbPath = redisUrl.pathname.replace(/^\//, "");
const db = dbPath ? Number(dbPath) : 0;
return {
host: redisUrl.hostname,
port: Number(redisUrl.port || (redisUrl.protocol === "rediss:" ? 6380 : 6379)),
username: redisUrl.username ? decodeURIComponent(redisUrl.username) : undefined,
password: redisUrl.password ? decodeURIComponent(redisUrl.password) : undefined,
db: Number.isFinite(db) ? db : 0,
tls: redisUrl.protocol === "rediss:" ? {} : undefined,
enableReadyCheck: false,
maxRetriesPerRequest: null,
};
}

export function createMediaQueue() {
return new Queue(mediaQueueName, {
connection: getMediaQueueConnection(),
prefix: mediaQueuePrefix,
defaultJobOptions: {
attempts: 3,
removeOnComplete: 1000,
removeOnFail: 1000,
},
});
}

export function buildMediaJobId(jobName, payload) {
return crypto
.createHash("sha1")
.update(JSON.stringify({ jobName, payload }))
.digest("hex");
}

export function getEnsureSectionThumbVariant(payload) {
return payload?.variant || `w${thumbnailTargetWidth}-jpeg`;
}

function normalizeFilePath(filePath) {
if (Array.isArray(filePath)) {
return filePath.filter(Boolean);
}
if (typeof filePath === "string") {
return filePath.split("/").filter(Boolean);
}
return [];
}

function resolveSection(sectionId, section) {
if (section) {
return section;
}
if (Number.isInteger(sectionId)) {
return config.sections?.[sectionId] ?? null;
}
return null;
}

export function resolveMediaJobName(jobName, payload) {
return payload?.action || jobName;
}

export async function processMediaJob(jobName, payload) {
const resolvedJobName = resolveMediaJobName(jobName, payload);
invariant(resolvedJobName, "job name is required");

switch (resolvedJobName) {
case mediaJobNames.getMetaForFile:
return storeImageMetadata(payload);
case mediaJobNames.storeMetaForVideo:
return storeVideoMetadata(payload);
case mediaJobNames.warmSectionFile:
case mediaJobNames.legacyEnsureSectionThumb:
return warmSectionThumb(payload);
default:
invariant(false, `no handler for ${resolvedJobName}`);
}
}

async function storeImageMetadata(payload) {
const section = resolveSection(payload?.sectionId, payload?.section);
const filePath = normalizeFilePath(payload?.filePath);
if (getMediaKind(filePath) !== "image") {
	return {
		action: mediaJobNames.getMetaForFile,
		filePath: filePath.join("/"),
		skipped: true,
		reason: "unsupported-media",
	};
}
return {
	action: mediaJobNames.getMetaForFile,
	...(await writeStoredMetaForFile(section, filePath, payload?.metaData ?? {})),
};
}

async function storeVideoMetadata(payload) {
const section = resolveSection(payload?.sectionId, payload?.section);
const filePath = normalizeFilePath(payload?.filePath);
const videoStream = payload?.data?.streams?.find(
(stream) => stream.codec_type === "video",
);
invariant(videoStream, "video stream not found");
const COMPUTED = { Width: videoStream.width, Height: videoStream.height };
return {
action: mediaJobNames.storeMetaForVideo,
...(await writeStoredMetaForFile(section, filePath, { ...payload.data, COMPUTED })),
};
}

async function warmSectionThumb(payload) {
const sectionId = Number(payload?.sectionId);
const section = resolveSection(sectionId, payload?.section);
const filePath = normalizeFilePath(payload?.filePath);
invariant(Number.isInteger(sectionId), "sectionId is required for warm-section-file");
invariant(section, "section not found");
invariant(section.path, "section.path");
const mediaKind = getMediaKind(filePath);
if (mediaKind === "unsupported") {
return {
	action: mediaJobNames.warmSectionFile,
	filePath: filePath.join("/"),
	skipped: true,
	reason: "unsupported-media",
};
}
const thumb = await ensureSectionThumb(
sectionId,
section,
filePath,
getEnsureSectionThumbVariant(payload),
);
if (mediaKind === "image" && !isVideoPath(filePath)) {
const metaData = await buildImageMetaData(section, filePath);
await writeStoredMetaForFile(section, filePath, metaData);
}
return {
action: mediaJobNames.warmSectionFile,
filePath: filePath.join("/"),
kind: thumb.kind,
source: thumb.source,
};
}
