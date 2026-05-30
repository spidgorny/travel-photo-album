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
