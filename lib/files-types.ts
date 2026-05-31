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

export interface FileEntryWithOptionalDate extends FilteredFileEntry {
	dirPath: string;
	fullPath: string;
	date: Date | null;
}

export interface FileGpsCoordinates {
	latitude: number;
	longitude: number;
}

export interface FileLocationLabel {
	label: string;
	locality: string;
	countryIso2?: string;
	countryName?: string;
}

export interface StoredDirectoryMetaEntry extends Record<string, unknown> {
	COMPUTED: {
		Width?: number;
		Height?: number;
		width?: number;
		height?: number;
	};
	GPS?: FileGpsCoordinates;
	location?: FileLocationLabel;
	description?: string;
	phash?: string;
}

export interface DailyLocationSummary extends FileLocationLabel {
	count: number;
}
