import type { FfprobeData } from "fluent-ffmpeg";
import type { ConfigSection } from "./config.ts";
import type { StoredDirectoryMetaEntry } from "./files-types.ts";

export const thumbQueueUrl =
	process.env.THUMB_QUEUE_URL?.trim() ||
	process.env.BULLMQ_REDIS_URL?.trim() ||
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
	section?: ConfigSection;
	filePath: string[];
	metaData: ThumbImageMetaData;
	force?: boolean;
}

export interface StoreMetaForVideoJob {
	action: typeof thumbJobActions.storeMetaForVideo;
	sectionId: number;
	section?: ConfigSection;
	filePath: string[];
	data: FfprobeData;
	force?: boolean;
}

export interface WarmSectionFileJob {
	action: typeof thumbJobActions.warmSectionFile;
	sectionId: number;
	section?: ConfigSection;
	filePath: string[];
	variant?: string;
	force?: boolean;
}

export type ThumbJobData = GetMetaForFileJob | StoreMetaForVideoJob | WarmSectionFileJob;

export function isThumbQueueConfigured() {
	return thumbQueueUrl.length > 0;
}

export function serializeSectionForWorker(section: ConfigSection): ConfigSection {
	return {
		...section,
		path: remapSectionPathForWorker(section.path),
	};
}

function remapSectionPathForWorker(sectionPath?: string) {
	if (!sectionPath) {
		return sectionPath;
	}

	const hostRoot = process.env.MEDIA_ROOT_HOST_PATH?.trim() || "/Volumes/photo";
	const containerRoot =
		process.env.MEDIA_ROOT_CONTAINER_PATH?.trim() || "/media/nas/photo";

	if (
		sectionPath === hostRoot ||
		sectionPath.startsWith(`${hostRoot}/`)
	) {
		return `${containerRoot}${sectionPath.slice(hostRoot.length)}`;
	}

	return sectionPath;
}
