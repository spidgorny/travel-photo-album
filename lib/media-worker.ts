// @ts-nocheck
import crypto from "crypto";
import fs from "fs";
import { Queue } from "bullmq";
import invariant from "tiny-invariant";
import config, { resolveSection as normalizeConfigSection } from "./config.ts";
import { DescriptionQueue } from "./description-queue.ts";
import {
	descriptionJobActions,
	isDescriptionQueueConfigured,
} from "./description-jobs.ts";
import {
	buildImageMetaData,
	normalizeStoredDescription,
	readStoredMetaForFile,
	writeStoredMetaForFile,
	normalizeStoredPhash,
} from "./file-meta.ts";
import { joinSectionPath } from "./files.ts";
import { isAutoDescriptionEnabled } from "./image-description.ts";
import {
thumbJobActions,
thumbQueueName,
thumbQueuePrefix,
thumbQueueUrl,
} from "./thumb-jobs.ts";
import {
ensureSectionThumb,
getMediaKind,
hasStoredSectionThumb,
isVideoPath,
readStoredSectionThumb,
thumbnailTargetWidth,
} from "./thumb-store.ts";

const defaultWorkerConcurrency = 2;
const defaultWorkerLockDurationMs = 10 * 60 * 1000;
const legacyEnsureSectionThumbJobName = "ensure-section-thumb";
const jobRetryDelayMs = 60 * 60 * 1000;

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

export function getWorkerLockDurationMs() {
const parsedLockDuration = Number(
process.env.BULLMQ_WORKER_LOCK_DURATION_MS ?? defaultWorkerLockDurationMs,
);
return Number.isInteger(parsedLockDuration) && parsedLockDuration >= 30_000
? parsedLockDuration
: defaultWorkerLockDurationMs;
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
backoff: {
	type: "fixed",
	delay: jobRetryDelayMs,
},
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

export function normalizeFilePath(filePath) {
if (Array.isArray(filePath)) {
return filePath.filter(Boolean);
}
if (typeof filePath === "string") {
return filePath.split("/").filter(Boolean);
}
return [];
}

export function resolveSection(sectionId, section) {
const configSection = Number.isInteger(sectionId)
? config.sections?.[sectionId] ?? null
: null;
const normalizedPayloadSection = section ? normalizeConfigSection(section) : null;
const matchedConfigSection =
!configSection && normalizedPayloadSection
	? config.sections?.find((candidate) => isSameSection(candidate, normalizedPayloadSection)) ?? null
	: null;
if (!configSection && !matchedConfigSection && !section && !normalizedPayloadSection) {
return null;
}
const resolvedSection = normalizeConfigSection({
...(configSection ?? matchedConfigSection ?? {}),
...(section ?? {}),
});
if (typeof section?.path === "string" && section.path.length > 0) {
return {
	...resolvedSection,
	path: section.path,
};
}
return resolvedSection;
}

function isSameSection(left, right) {
const leftKeys = getSectionIdentityKeys(left);
const rightKeys = getSectionIdentityKeys(right);
return leftKeys.some((key) => rightKeys.has(key));
}

function getSectionIdentityKeys(section) {
const keys = new Set();
for (const candidate of [
section?.name,
section?.path,
section?.macPath,
section?.linuxPath,
section?.winPath,
section?.pathWindows,
]) {
if (typeof candidate === "string" && candidate.trim().length > 0) {
	keys.add(candidate.trim());
}
}
return keys;
}

export function resolveMediaJobName(jobName, payload) {
return payload?.action || jobName;
}

function createPipelineSteps() {
return [];
}

async function runPipelineStep(steps, label, action) {
const startedAt = Date.now();
try {
	const value = await action();
	steps.push({
		label,
		status: "done",
		durationMs: Date.now() - startedAt,
	});
	return value;
} catch (error) {
	steps.push({
		label,
		status: "failed",
		durationMs: Date.now() - startedAt,
		detail: error instanceof Error ? error.message : String(error),
	});
	throw error;
}
}

function addPipelineStep(steps, label, status, detail) {
steps.push({
	label,
	status,
	durationMs: 0,
	detail,
});
}

function withPipeline(result, steps) {
return {
	...result,
	pipeline: {
		steps,
	},
};
}

function createImageSourceBufferLoader(section, filePath) {
let bufferPromise = null;
return async function getImageSourceBuffer() {
	if (!bufferPromise) {
		invariant(section?.path, "section.path");
		bufferPromise = fs.promises.readFile(joinSectionPath(section.path, filePath));
	}
	return bufferPromise;
};
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
const steps = createPipelineSteps();
const section = resolveSection(payload?.sectionId, payload?.section);
const filePath = normalizeFilePath(payload?.filePath);
if (getMediaKind(filePath) !== "image") {
	return withPipeline({
		action: mediaJobNames.getMetaForFile,
		filePath: filePath.join("/"),
		skipped: true,
		reason: "unsupported-media",
	}, steps);
}
const storedMeta = await runPipelineStep(steps, "store image metadata", () =>
	writeStoredMetaForFile(section, filePath, payload?.metaData ?? {}),
);
return withPipeline({
	action: mediaJobNames.getMetaForFile,
	...storedMeta,
}, steps);
}

async function storeVideoMetadata(payload) {
const steps = createPipelineSteps();
const section = resolveSection(payload?.sectionId, payload?.section);
const filePath = normalizeFilePath(payload?.filePath);
const videoStream = payload?.data?.streams?.find(
(stream) => stream.codec_type === "video",
);
invariant(videoStream, "video stream not found");
const COMPUTED = { Width: videoStream.width, Height: videoStream.height };
const storedMeta = await runPipelineStep(steps, "store video metadata", () =>
	writeStoredMetaForFile(section, filePath, { ...payload.data, COMPUTED }),
);
return withPipeline({
action: mediaJobNames.storeMetaForVideo,
...storedMeta,
}, steps);
}

async function warmSectionThumb(payload) {
	const steps = createPipelineSteps();
	const sectionId = Number(payload?.sectionId);
	const section = resolveSection(sectionId, payload?.section);
	const filePath = normalizeFilePath(payload?.filePath);
	invariant(Number.isInteger(sectionId), "sectionId is required for warm-section-file");
	invariant(section, "section not found");
	invariant(section.path, "section.path");
	const mediaKind = getMediaKind(filePath);
	if (mediaKind === "unsupported") {
	return withPipeline({
		action: mediaJobNames.warmSectionFile,
		filePath: filePath.join("/"),
		skipped: true,
		reason: "unsupported-media",
	}, steps);
	}
	const variant = getEnsureSectionThumbVariant(payload);
	const getImageSourceBuffer =
	mediaKind === "image" && !isVideoPath(filePath)
		? createImageSourceBufferLoader(section, filePath)
		: null;
	if (!(payload?.force ?? false)) {
	const [hasThumb, storedMeta] = await runPipelineStep(
		steps,
		"inspect existing thumb + metadata",
		() =>
			Promise.all([
				hasStoredSectionThumb(sectionId, section, filePath, variant),
				readStoredMetaForFile(section, filePath),
			]),
	);
	const hasDescription = Boolean(normalizeStoredDescription(storedMeta?.description));
	const hasPhash = Boolean(normalizeStoredPhash(storedMeta?.phash));
	const needsDescription =
		mediaKind === "image" && isDescriptionQueueConfigured() && !hasDescription;
	const needsPhash = mediaKind === "image" && !hasPhash;
	if (hasThumb && storedMeta && needsPhash) {
		const thumbForPhash = await readStoredSectionThumb(sectionId, section, filePath, variant);
		const metaData = await runPipelineStep(steps, "refresh metadata from existing thumb", async () =>
			buildImageMetaData(section, filePath, {
				sourceBuffer: getImageSourceBuffer ? await getImageSourceBuffer() : undefined,
				phashSourceBuffer: thumbForPhash?.buffer,
				existingMeta: storedMeta,
			}),
		);
		await runPipelineStep(steps, "store refreshed metadata", () =>
			writeStoredMetaForFile(section, filePath, metaData),
		);
	} else {
		addPipelineStep(
			steps,
			"refresh metadata from existing thumb",
			"skipped",
			"full pipeline will handle metadata if needed",
		);
		addPipelineStep(steps, "store refreshed metadata", "skipped", "no precheck refresh needed");
	}
	if (hasThumb && storedMeta && needsDescription) {
		await runPipelineStep(steps, "queue description job", () =>
			enqueueImageDescription(sectionId, section, filePath, variant, false),
		);
		return withPipeline({
			action: mediaJobNames.warmSectionFile,
			filePath: filePath.join("/"),
			queuedDescription: true,
			refreshedPhash: needsPhash,
			reason: needsPhash ? "missing-phash-and-description" : "missing-description",
		}, steps);
	}
	if (hasThumb && storedMeta && !needsDescription) {
		addPipelineStep(
			steps,
			"queue description job",
			"skipped",
			isDescriptionQueueConfigured() ? "description already present" : "description queue disabled",
		);
		return withPipeline({
			action: mediaJobNames.warmSectionFile,
			filePath: filePath.join("/"),
			skipped: !needsPhash,
			refreshedPhash: needsPhash,
			reason: needsPhash ? "missing-phash" : "already-indexed",
		}, steps);
	}
	}
	const thumb = await runPipelineStep(steps, "generate thumbnail", async () =>
		ensureSectionThumb(
			sectionId,
			section,
			filePath,
			variant,
			undefined,
			{
				sourceBuffer: getImageSourceBuffer ? await getImageSourceBuffer() : undefined,
			},
		),
	);
	if (mediaKind === "image" && !isVideoPath(filePath)) {
		const thumbPhashSource =
			thumb.kind === "buffer" ? thumb.buffer : thumb.generatedBuffer;
		const metaData = await runPipelineStep(steps, "build image metadata", async () =>
			buildImageMetaData(section, filePath, {
				sourceBuffer: getImageSourceBuffer ? await getImageSourceBuffer() : undefined,
				phashSourceBuffer: thumbPhashSource,
			}),
		);
		await runPipelineStep(steps, "store metadata", () =>
			writeStoredMetaForFile(section, filePath, metaData),
		);
		if (isDescriptionQueueConfigured()) {
			await runPipelineStep(steps, "queue description job", () =>
				enqueueImageDescription(sectionId, section, filePath, variant, payload?.force ?? false),
			);
		} else {
			addPipelineStep(steps, "queue description job", "skipped", "description queue disabled");
		}
	} else {
		addPipelineStep(steps, "build image metadata", "skipped", "not an image");
		addPipelineStep(steps, "store metadata", "skipped", "not an image");
		addPipelineStep(steps, "queue description job", "skipped", "not an image");
	}
	return withPipeline({
		action: mediaJobNames.warmSectionFile,
		filePath: filePath.join("/"),
		kind: thumb.kind,
		source: thumb.source,
	}, steps);
}

async function enqueueImageDescription(
sectionId,
section,
filePath,
variant,
force = false,
) {
if (!isDescriptionQueueConfigured()) {
	return null;
}
const queue = new DescriptionQueue();
return queue.enqueue({
	action: descriptionJobActions.generateImageDescription,
	sectionId,
	section,
	filePath,
	variant,
	force,
});
}
