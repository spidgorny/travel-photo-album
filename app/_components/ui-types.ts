import type { ConfigSection } from "../../lib/config";
import type {
	DailyLocationSummary,
	FileLocationLabel,
} from "../../lib/files-types";

export interface UISection extends ConfigSection {
	id: number;
}

export interface FilesApiEntry {
	path: string;
	isDir?: boolean;
	dirPath?: string;
	fullPath?: string;
	date?: string | Date;
	width?: number;
	height?: number;
	dominantColor?: string;
	description?: string;
	original?: {
		width: number;
		height: number;
	};
	title?: string;
	caption?: string;
	[key: string]: unknown;
}

export interface DatesResponse {
	sectionId?: number;
	dates?: Record<string, number | DaySummary>;
	locationsByDate?: Record<string, DailyLocationSummary[]>;
	pagination?: DatesPagination;
}

export interface DaySummary {
	count: number;
	locations?: string[];
}

export interface DatesPagination {
	page: number;
	totalPages: number;
	totalFiles: number;
	totalDays: number;
	pageFiles: number;
	pageDays: number;
	perPageFileLimit: number;
	hasPreviousPage: boolean;
	hasNextPage: boolean;
}

export interface FilesResponse {
	sectionId?: number;
	section?: UISection;
	files?: FilesApiEntry[];
}

export interface MetaResponse {
	COMPUTED?: {
		Width?: number;
		Height?: number;
		width?: number;
		height?: number;
	};
	GPS?: {
		latitude?: number;
		longitude?: number;
	};
	location?: FileLocationLabel;
	dimensions?: {
		width?: number;
		height?: number;
	};
	description?: string | null;
	[key: string]: unknown;
}

export interface QueueCounts {
	waiting: number;
	active: number;
	delayed: number;
	completed: number;
	failed: number;
	paused: number;
}

export interface QueueInfo {
	configured: boolean;
	connectionUrl: string | null;
	name: string;
	prefix: string;
	counts: QueueCounts;
	totalQueued: number;
	totalProcessed: number;
	queues?: Array<{
		label: "media" | "description";
		configured: boolean;
		connectionUrl: string | null;
		name: string;
		prefix: string;
		counts: QueueCounts;
	}>;
}

export interface ThumbStorageRootInfo {
	path: string;
	exists: boolean;
	directories: number;
	thumbnailFiles: number;
	metaFiles: number;
	totalBytes: number;
}

export interface ThumbStorageInfo {
	configuredSections: number;
	diskBackedSections: number;
	kvBackedSections: number;
	disk: {
		configuredRoots: number;
		missingRoots: number;
		directories: number;
		thumbnailFiles: number;
		metaFiles: number;
		totalBytes: number;
	};
	diskRoots: ThumbStorageRootInfo[];
	kv: {
		configured: boolean;
		connectionUrl: string | null;
		prefix: string;
		blobEntries: number;
		metaEntries: number;
	};
}

export interface AppInfoResponse {
	queue: QueueInfo;
	storage: ThumbStorageInfo;
	updatedAt: string;
}

export interface QueueProgressResponse {
	queue: QueueInfo;
	updatedAt: string;
}

export interface FolderInfoResponse {
	sectionId: number;
	collection: string;
	folder: string;
	storageMode: "kv" | "disk";
	counts: {
		originalFiles: number;
		imageFiles: number;
		videoFiles: number;
		unsupportedFiles: number;
		thumbnails: number;
		metadataEntries: number;
		exifEntries: number;
		dominantColors: number;
		kvThumbEntries: number;
		kvMetaEntries: number;
	};
	updatedAt: string;
}

export interface GalleryPhoto extends FilesApiEntry {
	key: string;
	src: string;
	source: {
		regular: string;
		fullscreen?: string;
		thumbnail: string;
	};
	width: number;
	height: number;
	caption?: string;
	original?: {
		width: number;
		height: number;
	};
}

export function firstQueryValue(
	value: string | string[] | undefined,
): string | undefined {
	return Array.isArray(value) ? value[0] : value;
}
