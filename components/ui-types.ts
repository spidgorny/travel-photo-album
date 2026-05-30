import type { ConfigSection } from "../lib/config";

export interface UISection extends ConfigSection {
	id: number;
}

export interface FilesApiEntry {
	path: string;
	isDir?: boolean;
	dirPath?: string;
	fullPath?: string;
	date?: string | Date;
	title?: string;
	caption?: string;
	[key: string]: unknown;
}

export interface DatesResponse {
	sectionId?: number;
	dates?: Record<string, number>;
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
	dimensions?: {
		width?: number;
		height?: number;
	};
	[key: string]: unknown;
}

export interface GalleryPhoto extends FilesApiEntry {
	key: string;
	src: string;
	source: {
		regular: string;
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

export function firstQueryValue(value: string | string[] | undefined): string | undefined {
	return Array.isArray(value) ? value[0] : value;
}
