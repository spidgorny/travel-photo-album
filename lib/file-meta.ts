import crypto from "crypto";
import fs from "fs";
import path from "path";
import exifr from "exifr";
import sizeOf from "image-size";
import mime from "mime-types";
import sharp from "sharp";
import { getNearestCity } from "offline-geocode-city";
import invariant from "tiny-invariant";
import type { ConfigSection } from "./config.ts";
import { joinSectionPath } from "./files.ts";
import { getThumbKvClient, thumbKvPrefix } from "./thumb-store.ts";
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
	const metaRoot = section.thumbPath;
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

export function getStoredMetaDirectoryKey(
	section: ConfigSection,
	filePath: string[],
): string {
	if (section.thumbPath) {
		return getMetaFilePath(section, filePath);
	}

	const directoryPath = path.posix.dirname(filePath.join("/"));
	const sectionKey = section.path ?? section.name ?? "section";
	const hash = crypto
		.createHash("sha1")
		.update(JSON.stringify({ sectionKey, directoryPath }))
		.digest("hex");
	return `${thumbKvPrefix}:directory-meta:${hash}`;
}

export async function readStoredMetaDirectory(
	section: ConfigSection,
	filePath: string[],
): Promise<DirectoryMetaData> {
	if (section.thumbPath) {
		return readDirectoryMetaFile(getMetaFilePath(section, filePath));
	}

	const client = await getThumbKvClient();
	if (!client) {
		return {};
	}

	const raw = await client.get(getStoredMetaDirectoryKey(section, filePath));
	if (!raw) {
		return {};
	}

	try {
		return JSON.parse(raw) as DirectoryMetaData;
	} catch {
		return {};
	}
}

export async function readStoredMetaForFile(
	section: ConfigSection,
	filePath: string[],
): Promise<StoredDirectoryMetaEntry | null> {
	const metaData = await readStoredMetaDirectory(section, filePath);
	return metaData[path.basename(filePath.join("/"))] ?? null;
}

export async function writeStoredMetaForFile(
	section: ConfigSection,
	filePath: string[],
	metaEntry: StoredDirectoryMetaEntry,
) {
	const metaData = await readStoredMetaDirectory(section, filePath);
	const baseName = path.basename(filePath.join("/"));
	metaData[baseName] = metaEntry;

	if (section.thumbPath) {
		const metaFile = getMetaFilePath(section, filePath);
		fs.mkdirSync(path.dirname(metaFile), { recursive: true });
		fs.writeFileSync(metaFile, JSON.stringify(metaData, null, 2));
		return { metaFile, baseName };
	}

	const client = await getThumbKvClient();
	invariant(client, "thumb KV is required to store metadata for sections without thumbPath");
	const metaKey = getStoredMetaDirectoryKey(section, filePath);
	await client.set(metaKey, JSON.stringify(metaData));
	return { metaFile: metaKey, baseName };
}

export async function buildImageMetaData(
	section: ConfigSection,
	filePath: string[],
): Promise<ThumbImageMetaData> {
	invariant(section.path, "section.path");
	const fullPath = joinSectionPath(section.path, filePath);
	const dimensions = await getImageDimensions(fullPath);
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

export async function hasExifOrientationTransform(
	section: ConfigSection,
	filePath: string[],
): Promise<boolean> {
	invariant(section.path, "section.path");
	const fullPath = joinSectionPath(section.path, filePath);
	try {
		const metadata = await sharp(fullPath).metadata();
		return (metadata.orientation ?? 1) > 1;
	} catch {
		return false;
	}
}

async function getImageDimensions(fullPath: string) {
	try {
		const metadata = await sharp(fullPath).metadata();
		const width = metadata.width ?? fallbackDimensions.width;
		const height = metadata.height ?? fallbackDimensions.height;
		const orientation = metadata.orientation;
		const shouldSwapSides = orientation !== undefined && orientation >= 5 && orientation <= 8;
		return {
			width: shouldSwapSides ? height : width,
			height: shouldSwapSides ? width : height,
		};
	} catch {
		const fileBuffer = fs.readFileSync(fullPath);
		const dimensions = sizeOf(fileBuffer);
		const orientation = dimensions.orientation;
		const shouldSwapSides = orientation !== undefined && orientation >= 5 && orientation <= 8;
		return {
			width: shouldSwapSides
				? (dimensions.height ?? fallbackDimensions.height)
				: (dimensions.width ?? fallbackDimensions.width),
			height: shouldSwapSides
				? (dimensions.width ?? fallbackDimensions.width)
				: (dimensions.height ?? fallbackDimensions.height),
		};
	}
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
