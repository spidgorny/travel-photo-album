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
	phash?: string;
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
	undated?: number | DaySummary;
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
	metaSearchKeys?: string[];
	phash?: string;
	storedMeta?: Record<string, unknown> | null;
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

export interface QueueDurationHistogramBucket {
	startMs: number;
	endMs: number;
	count: number;
	includesLowerTail?: boolean;
	includesUpperTail?: boolean;
}

export interface QueueInfo {
	configured: boolean;
	connectionUrl: string | null;
	name: string;
	prefix: string;
	counts: QueueCounts;
	totalQueued: number;
	totalProcessed: number;
	averageSuccessfulJobTimeMs: number | null;
	sampledSuccessfulJobs: number;
	queues?: Array<{
		label: "media" | "description";
		configured: boolean;
		connectionUrl: string | null;
		name: string;
		prefix: string;
		counts: QueueCounts;
		averageSuccessfulJobTimeMs: number | null;
		sampledSuccessfulJobs: number;
		durationHistogram: QueueDurationHistogramBucket[];
	}>;
}

export interface ThumbStorageInfo {
	configuredSections: number;
	kv: {
		configured: boolean;
		connectionUrl: string | null;
		prefix: string;
		blobEntries: number;
		thumbnailMetaEntries: number;
		directoryMetaKeys: number;
		fileMetadataEntries: number;
		gpsEntries: number;
		locationEntries: number;
		descriptionEntries: number;
		phashEntries: number;
		totalKeys: number | null;
		usedMemoryBytes: number | null;
		usedMemoryHuman: string | null;
	};
}

export interface QueueProgressResponse {
	queue: QueueInfo;
	updatedAt: string;
}

export interface ThumbStorageResponse {
	storage: ThumbStorageInfo;
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
