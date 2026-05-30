import fs from "fs";
import path from "path";
import exifr from "exifr";
import sizeOf from "image-size";
import mime from "mime-types";
import { getNearestCity } from "offline-geocode-city";
import invariant from "tiny-invariant";
import type { ConfigSection } from "./config.ts";
import { joinSectionPath } from "./files.ts";
import type {
	FileGpsCoordinates,
	FileLocationLabel,
	StoredDirectoryMetaEntry,
} from "./files-types.ts";
import type { ThumbImageMetaData } from "./thumb-jobs.ts";

export type DirectoryMetaData = Record<string, StoredDirectoryMetaEntry>;
const fallbackDimensions = { width: 3, height: 2 };

const locationCache = new Map<string, FileLocationLabel | null>();

export function getMetaFilePath(section: ConfigSection, filePath: string[]): string {
	const metaRoot = section.thumbPath ?? section.path;
	invariant(metaRoot, "section.path");
	const metaDir = path.dirname(joinSectionPath(metaRoot, filePath));
	return path.join(metaDir, "meta.json");
}

export function readDirectoryMetaFile(metaFile: string): DirectoryMetaData {
	try {
		return JSON.parse(fs.readFileSync(metaFile, "utf8")) as DirectoryMetaData;
	} catch {
		return {};
	}
}

export function readStoredMetaForFile(
	section: ConfigSection,
	filePath: string[],
): StoredDirectoryMetaEntry | null {
	const metaData = readDirectoryMetaFile(getMetaFilePath(section, filePath));
	return metaData[path.basename(filePath.join("/"))] ?? null;
}

export function writeStoredMetaForFile(
	section: ConfigSection,
	filePath: string[],
	metaEntry: StoredDirectoryMetaEntry,
) {
	const metaFile = getMetaFilePath(section, filePath);
	const metaData = readDirectoryMetaFile(metaFile);
	const baseName = path.basename(filePath.join("/"));
	metaData[baseName] = metaEntry;
	fs.mkdirSync(path.dirname(metaFile), { recursive: true });
	fs.writeFileSync(metaFile, JSON.stringify(metaData, null, 2));
	return { metaFile, baseName };
}

export async function buildImageMetaData(
	section: ConfigSection,
	filePath: string[],
): Promise<ThumbImageMetaData> {
	invariant(section.path, "section.path");
	const fullPath = joinSectionPath(section.path, filePath);
	const fileBuffer = fs.readFileSync(fullPath);
	const dimensions = sizeOf(fileBuffer);
	const gps = await extractGpsCoordinates(fullPath);
	const location = gps ? reverseGeocodeLocation(gps) : null;

	return {
		FileName: path.basename(fullPath),
		MimeType: mime.lookup(fullPath),
		FileSize: fs.statSync(fullPath).size,
		COMPUTED: {
			Width: dimensions.width,
			Height: dimensions.height,
		},
		dimensions,
		...(gps ? { GPS: gps } : {}),
		...(location ? { location } : {}),
	};
}

export function buildBasicFileMetaData(
	section: ConfigSection,
	filePath: string[],
): ThumbImageMetaData {
	invariant(section.path, "section.path");
	const fullPath = joinSectionPath(section.path, filePath);
	return {
		FileName: path.basename(fullPath),
		MimeType: mime.lookup(fullPath),
		FileSize: fs.statSync(fullPath).size,
		COMPUTED: {
			Width: fallbackDimensions.width,
			Height: fallbackDimensions.height,
		},
		dimensions: fallbackDimensions,
	};
}

async function extractGpsCoordinates(fullPath: string): Promise<FileGpsCoordinates | null> {
	try {
		const gps = await exifr.gps(fullPath);
		if (!gps) {
			return null;
		}
		const latitude = normalizeCoordinate(gps.latitude);
		const longitude = normalizeCoordinate(gps.longitude);
		if (latitude === null || longitude === null) {
			return null;
		}
		return { latitude, longitude };
	} catch {
		return null;
	}
}

function normalizeCoordinate(value: unknown): number | null {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return null;
	}
	return value;
}

function reverseGeocodeLocation(gps: FileGpsCoordinates): FileLocationLabel | null {
	const cacheKey = `${gps.latitude.toFixed(4)},${gps.longitude.toFixed(4)}`;
	if (locationCache.has(cacheKey)) {
		return locationCache.get(cacheKey) ?? null;
	}

	try {
		const nearestCity = getNearestCity(gps.latitude, gps.longitude);
		const locality = nearestCity?.cityName?.trim();
		if (!locality) {
			locationCache.set(cacheKey, null);
			return null;
		}
		const location = {
			label: locality,
			locality,
			countryIso2: nearestCity.countryIso2 || undefined,
			countryName: nearestCity.countryName || undefined,
		} satisfies FileLocationLabel;
		locationCache.set(cacheKey, location);
		return location;
	} catch {
		locationCache.set(cacheKey, null);
		return null;
	}
}
