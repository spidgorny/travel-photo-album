import type { FfprobeData } from "fluent-ffmpeg";
import type { StoredDirectoryMetaEntry } from "./files-types.ts";

export const thumbQueueUrl =
	process.env.THUMB_QUEUE_URL?.trim() ||
	process.env.BULLMQ_REDIS_URL?.trim() ||
	process.env.THUMB_KV_URL?.trim() ||
	process.env.REDIS_URL?.trim() ||
	"";

export const thumbQueueName = process.env.THUMB_QUEUE_NAME?.trim() || "thumb-jobs";
export const thumbQueuePrefix =
	process.env.THUMB_QUEUE_PREFIX?.trim() || "travel-photo-album";

export const thumbJobActions = {
	getMetaForFile: "get-meta-for-file",
	storeMetaForVideo: "store-meta-for-video",
	warmSectionFile: "warm-section-file",
} as const;

export type ThumbJobAction = (typeof thumbJobActions)[keyof typeof thumbJobActions];

export interface ThumbImageMetaData extends StoredDirectoryMetaEntry {
	FileName: string;
	MimeType: string | false;
	FileSize: number;
	dimensions: ReturnType<(typeof import("image-size"))["default"]>;
}

export interface GetMetaForFileJob {
	action: typeof thumbJobActions.getMetaForFile;
	sectionId: number;
	filePath: string[];
	metaData: ThumbImageMetaData;
}

export interface StoreMetaForVideoJob {
	action: typeof thumbJobActions.storeMetaForVideo;
	sectionId: number;
	filePath: string[];
	data: FfprobeData;
}

export interface WarmSectionFileJob {
	action: typeof thumbJobActions.warmSectionFile;
	sectionId: number;
	filePath: string[];
	variant?: string;
}

export type ThumbJobData = GetMetaForFileJob | StoreMetaForVideoJob | WarmSectionFileJob;

export function isThumbQueueConfigured() {
	return thumbQueueUrl.length > 0;
}
