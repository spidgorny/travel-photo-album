import type { ConfigSection } from "./config";

export interface FilteredFileEntry {
	path: string;
	stats: Record<string, unknown>;
	isDir: boolean;
}

export interface DatedFileEntry extends FilteredFileEntry {
	dirPath: string;
	fullPath: string;
	date: Date;
}

export function joinSectionPath(sectionPath: string, filePath?: string[]): string;
export function getFilteredFiles(
	section: ConfigSection,
	filePath?: string[],
): Promise<FilteredFileEntry[]>;
export function getFileDates(
	section: ConfigSection,
	imagePath?: string[],
): Promise<DatedFileEntry[]>;
export function getFileDate(
	pathName: string,
	defaultCtime?: Date | null,
): Date | null;
