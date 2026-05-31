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
const phashSize = 8;
const phashSampleSize = 32;

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

	return getStoredMetaDirectoryKeys(section, filePath)[0];
}

export function getStoredMetaDirectoryKeys(
	section: ConfigSection,
	filePath: string[],
): string[] {
	if (section.thumbPath) {
		return [getMetaFilePath(section, filePath)];
	}

	const directoryPath = path.posix.dirname(filePath.join("/"));
	return getSectionKeyAliases(section).map((sectionKey) =>
		buildStoredMetaDirectoryKey(sectionKey, directoryPath),
	);
}

function buildStoredMetaDirectoryKey(sectionKey: string, directoryPath: string) {
	const hash = crypto
		.createHash("sha1")
		.update(JSON.stringify({ sectionKey, directoryPath }))
		.digest("hex");
	return `${thumbKvPrefix}:directory-meta:${hash}`;
}

function getSectionKeyAliases(section: ConfigSection): string[] {
	const aliases = new Set<string>();
	const hostRoot = process.env.MEDIA_ROOT_HOST_PATH?.trim() || "/Volumes/photo";
	const containerRoot =
		process.env.MEDIA_ROOT_CONTAINER_PATH?.trim() || "/media/nas/photo";

	for (const candidate of [
		section.path,
		section.macPath,
		section.linuxPath,
		section.winPath,
		section.pathWindows,
		section.name,
	]) {
		if (typeof candidate !== "string" || candidate.trim().length === 0) {
			continue;
		}
		const normalizedCandidate = candidate.trim();
		aliases.add(normalizedCandidate);
		const hostToContainer = remapSectionKey(normalizedCandidate, hostRoot, containerRoot);
		if (hostToContainer) {
			aliases.add(hostToContainer);
		}
		const containerToHost = remapSectionKey(normalizedCandidate, containerRoot, hostRoot);
		if (containerToHost) {
			aliases.add(containerToHost);
		}
	}

	if (aliases.size === 0) {
		aliases.add("section");
	}

	return [...aliases];
}

function remapSectionKey(sectionKey: string, fromRoot: string, toRoot: string) {
	if (!sectionKey || !fromRoot || !toRoot) {
		return null;
	}
	if (sectionKey === fromRoot) {
		return toRoot;
	}
	if (sectionKey.startsWith(`${fromRoot}/`)) {
		return `${toRoot}${sectionKey.slice(fromRoot.length)}`;
	}
	return null;
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

	for (const key of getStoredMetaDirectoryKeys(section, filePath)) {
		const raw = await client.get(key);
		if (!raw) {
			continue;
		}
		try {
			return JSON.parse(raw) as DirectoryMetaData;
		} catch {
			return {};
		}
	}

	return {};
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
	const metaKeys = getStoredMetaDirectoryKeys(section, filePath);
	for (const metaKey of metaKeys) {
		await client.set(metaKey, JSON.stringify(metaData));
	}
	return { metaFile: metaKeys[0], baseName };
}

export function normalizeStoredDescription(value: unknown): string | undefined {
	if (typeof value !== "string") {
		return undefined;
	}
	const normalized = value.trim();
	return normalized.length ? normalized : undefined;
}

export function normalizeStoredPhash(value: unknown): string | undefined {
	if (typeof value !== "string") {
		return undefined;
	}
	const normalized = value.trim().toLowerCase();
	return /^[0-9a-f]{16}$/.test(normalized) ? normalized : undefined;
}

export async function updateStoredDescriptionForFile(
	section: ConfigSection,
	filePath: string[],
	description: string | null | undefined,
) {
	const existingMeta = (await readStoredMetaForFile(section, filePath)) ?? { COMPUTED: {} };
	const normalizedDescription = normalizeStoredDescription(description);
	const nextMeta: StoredDirectoryMetaEntry = {
		...existingMeta,
		COMPUTED: existingMeta.COMPUTED ?? {},
	};
	if (normalizedDescription) {
		nextMeta.description = normalizedDescription;
	} else {
		delete nextMeta.description;
	}
	return writeStoredMetaForFile(section, filePath, nextMeta);
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
	const existingMeta = await readStoredMetaForFile(section, filePath);
	const description = normalizeStoredDescription(existingMeta?.description);
	const phash = (await buildPerceptualHash(fullPath)) ?? normalizeStoredPhash(existingMeta?.phash);

	return {
		FileName: path.basename(fullPath),
		MimeType: mime.lookup(fullPath),
		FileSize: fs.statSync(fullPath).size,
		COMPUTED: {
			Width: dimensions.width,
			Height: dimensions.height,
		},
		dimensions,
		...(description ? { description } : {}),
		...(phash ? { phash } : {}),
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

async function buildPerceptualHash(fullPath: string): Promise<string | null> {
	try {
		const buffer = await sharp(fullPath)
			.rotate()
			.resize(phashSampleSize, phashSampleSize, { fit: "fill" })
			.grayscale()
			.raw()
			.toBuffer();
		const matrix = new Array(phashSampleSize)
			.fill(null)
			.map((_, rowIndex) =>
				new Array(phashSampleSize)
					.fill(0)
					.map((__, columnIndex) => buffer[rowIndex * phashSampleSize + columnIndex] ?? 0),
			);
		const coefficients = discreteCosineTransform(matrix, phashSize);
		const values = coefficients.flat();
		const threshold = median(values.slice(1));
		const bits = values.map((value) => (value > threshold ? "1" : "0")).join("");
		return bitsToHex(bits);
	} catch {
		return null;
	}
}

function discreteCosineTransform(matrix: number[][], sampleCount: number) {
	const sourceSize = matrix.length;
	const result = Array.from({ length: sampleCount }, () => Array(sampleCount).fill(0));

	for (let u = 0; u < sampleCount; u += 1) {
		for (let v = 0; v < sampleCount; v += 1) {
			let sum = 0;
			for (let i = 0; i < sourceSize; i += 1) {
				for (let j = 0; j < sourceSize; j += 1) {
					sum +=
						matrix[i][j] *
						Math.cos(((2 * i + 1) * u * Math.PI) / (2 * sourceSize)) *
						Math.cos(((2 * j + 1) * v * Math.PI) / (2 * sourceSize));
				}
			}
			const alphaU = u === 0 ? Math.SQRT1_2 : 1;
			const alphaV = v === 0 ? Math.SQRT1_2 : 1;
			result[u][v] = (0.25 * alphaU * alphaV * sum) / sourceSize;
		}
	}

	return result;
}

function median(values: number[]) {
	const sorted = [...values].sort((left, right) => left - right);
	const middle = Math.floor(sorted.length / 2);
	if (sorted.length % 2 === 0) {
		return (sorted[middle - 1] + sorted[middle]) / 2;
	}
	return sorted[middle];
}

function bitsToHex(bits: string) {
	let hex = "";
	for (let index = 0; index < bits.length; index += 4) {
		hex += Number.parseInt(bits.slice(index, index + 4), 2).toString(16);
	}
	return hex;
}
