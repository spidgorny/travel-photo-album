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
	date?: string;
	GPS?: FileGpsCoordinates;
	location?: FileLocationLabel;
	description?: string;
	phash?: string;
	personNames?: string[];
	faces?: StoredFaceMatch[];
}

export interface StoredFaceBoundingBox {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface StoredFaceMatch extends Record<string, unknown> {
	faceId: string;
	box: StoredFaceBoundingBox;
	detectorScore?: number;
	matchScore?: number;
	personId?: string;
	personName?: string;
}

export interface StoredFaceMetadata extends Record<string, unknown> {
	faces?: StoredFaceMatch[];
	personNames?: string[];
	model?: string;
	analyzedAt?: string;
	imageSha1?: string;
}

export interface DailyLocationSummary extends FileLocationLabel {
	count: number;
}
