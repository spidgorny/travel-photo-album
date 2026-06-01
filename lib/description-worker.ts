// @ts-nocheck
import invariant from "tiny-invariant";
import { descriptionJobActions } from "./description-jobs.ts";
import {
	buildImageMetaData,
	getStoredMetaDate,
	normalizeStoredDescription,
	readStoredMetaForFile,
	writeStoredMetaForFile,
} from "./file-meta.ts";
import { isAutoDescriptionEnabled, maybeGenerateImageDescription } from "./image-description.ts";
import { joinSectionPath } from "./files.ts";
import {
	getEnsureSectionThumbVariant,
	normalizeFilePath,
	resolveSection,
} from "./media-worker.ts";
import { upsertSearchEntryFromStoredMeta } from "./search-index.ts";
import { ensureSectionThumb, getMediaKind, isVideoPath } from "./thumb-store.ts";

export const descriptionWorkerJobNames = {
	generateImageDescription: descriptionJobActions.generateImageDescription,
} as const;

const defaultDescriptionWorkerLockDurationMs = 30 * 60 * 1000;

export function getDescriptionWorkerLockDurationMs() {
	const parsedLockDuration = Number(
		process.env.DESCRIPTION_WORKER_LOCK_DURATION_MS ??
			process.env.BULLMQ_WORKER_LOCK_DURATION_MS ??
			defaultDescriptionWorkerLockDurationMs,
	);
	return Number.isInteger(parsedLockDuration) && parsedLockDuration >= 30_000
		? parsedLockDuration
		: defaultDescriptionWorkerLockDurationMs;
}

export function resolveDescriptionJobName(jobName, payload) {
	return payload?.action || jobName;
}

export async function processDescriptionJob(jobName, payload) {
	const resolvedJobName = resolveDescriptionJobName(jobName, payload);
	invariant(resolvedJobName, "job name is required");

	switch (resolvedJobName) {
		case descriptionWorkerJobNames.generateImageDescription:
			return warmImageDescription(payload);
		default:
			invariant(false, `no handler for ${resolvedJobName}`);
	}
}

async function warmImageDescription(payload) {
	const sectionId = Number(payload?.sectionId);
	const section = resolveSection(sectionId, payload?.section);
	const filePath = normalizeFilePath(payload?.filePath);
	invariant(Number.isInteger(sectionId), "sectionId is required for generate-image-description");
	invariant(section, "section not found");
	invariant(section.path, "section.path");
	if (!isAutoDescriptionEnabled()) {
		return {
			action: descriptionWorkerJobNames.generateImageDescription,
			filePath: filePath.join("/"),
			skipped: true,
			reason: "disabled",
		};
	}
	if (getMediaKind(filePath) !== "image" || isVideoPath(filePath)) {
		return {
			action: descriptionWorkerJobNames.generateImageDescription,
			filePath: filePath.join("/"),
			skipped: true,
			reason: "unsupported-media",
		};
	}
	const variant = getEnsureSectionThumbVariant(payload);
	const existingMeta = await readStoredMetaForFile(section, filePath);
	if (!(payload?.force ?? false) && normalizeStoredDescription(existingMeta?.description)) {
		return {
			action: descriptionWorkerJobNames.generateImageDescription,
			filePath: filePath.join("/"),
			skipped: true,
			reason: "already-described",
		};
	}
	const thumb = await ensureSectionThumb(sectionId, section, filePath, variant);
	const metaData = existingMeta ?? (await buildImageMetaData(section, filePath));
	const generatedDescription = await maybeGenerateImageDescription({
		section,
		filePath,
		thumb,
		metaData,
	});
	if (!generatedDescription) {
		return {
			action: descriptionWorkerJobNames.generateImageDescription,
			filePath: filePath.join("/"),
			skipped: true,
			reason: "no-description-generated",
		};
	}
	const nextMeta = {
		...metaData,
		date: getStoredMetaDate(joinSectionPath(section.path, filePath), metaData),
		description: generatedDescription,
	};
	await writeStoredMetaForFile(section, filePath, nextMeta);
	try {
		await upsertSearchEntryFromStoredMeta(
			{ ...section, id: sectionId },
			filePath,
			nextMeta,
		);
	} catch (error) {
		console.warn("Non-fatal description worker search index update failed", {
			filePath: filePath.join("/"),
			error,
		});
	}
	return {
		action: descriptionWorkerJobNames.generateImageDescription,
		filePath: filePath.join("/"),
		description: generatedDescription,
	};
}
