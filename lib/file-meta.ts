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
import { formatDayKey, getFileDate, joinSectionPath, parseDayKey } from "./files.ts";
import { getThumbKvClient, thumbKvPrefix } from "./thumb-store.ts";
import type {
	FileGpsCoordinates,
	FileLocationLabel,
	StoredDirectoryMetaEntry,
	StoredFaceMatch,
	StoredFaceMetadata,
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

function buildSearchRegistryKey(sectionKey: string) {
	const hash = crypto
		.createHash("sha1")
		.update(JSON.stringify({ sectionKey, kind: "search-registry" }))
		.digest("hex");
	return `${thumbKvPrefix}:search-registry:${hash}`;
}

function buildStoredFaceKey(sectionKey: string, filePath: string) {
	const hash = crypto
		.createHash("sha1")
		.update(JSON.stringify({ sectionKey, filePath, kind: "face-meta" }))
		.digest("hex");
	return `${thumbKvPrefix}:face-meta:${hash}`;
}

function buildFaceRegistryKey(sectionKey: string) {
	const hash = crypto
		.createHash("sha1")
		.update(JSON.stringify({ sectionKey, kind: "face-registry" }))
		.digest("hex");
	return `${thumbKvPrefix}:face-registry:${hash}`;
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
	const directoryPath = filePath.slice(0, -1);
	const fileName = path.basename(filePath.join("/"));
	const metaData = await readStoredMetaDirectory(section, directoryPath);
	const storedMeta = metaData[fileName] ?? null;
	const faceMeta = await readStoredFaceDataForFile(section, filePath);
	return mergeStoredMetaWithFaceData(storedMeta, faceMeta);
}

export async function writeStoredMetaForFile(
	section: ConfigSection,
	filePath: string[],
	metaEntry: StoredDirectoryMetaEntry,
) {
	const metaData = await readStoredMetaDirectory(section, filePath);
	const baseName = path.basename(filePath.join("/"));
	metaData[baseName] = stripStoredFaceFields(metaEntry);

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
	for (const registryKey of getSearchRegistryKeys(section)) {
		await client.sAdd(registryKey, filePath.join("/"));
	}
	return { metaFile: metaKeys[0], baseName };
}

export async function readStoredFaceDataForFile(
	section: ConfigSection,
	filePath: string[],
): Promise<StoredFaceMetadata | null> {
	const client = await getThumbKvClient();
	if (!client) {
		return null;
	}

	for (const faceKey of getStoredFaceKeys(section, filePath)) {
		const raw = await client.get(faceKey);
		if (typeof raw !== "string" || raw.length === 0) {
			continue;
		}
		return normalizeStoredFaceMetadata(JSON.parse(raw) as unknown);
	}

	return null;
}

export async function writeStoredFaceDataForFile(
	section: ConfigSection,
	filePath: string[],
	faceMeta: StoredFaceMetadata,
) {
	const client = await getThumbKvClient();
	invariant(client, "thumb KV is required to store face metadata");

	const normalized = normalizeStoredFaceMetadata(faceMeta);
	const encoded = JSON.stringify(normalized);
	for (const faceKey of getStoredFaceKeys(section, filePath)) {
		await client.set(faceKey, encoded);
	}

	const registryValue = filePath.join("/");
	for (const registryKey of getFaceRegistryKeys(section)) {
		await client.sAdd(registryKey, registryValue);
	}

	return { faceKey: getStoredFaceKeys(section, filePath)[0] };
}

function getSearchRegistryKeys(section: ConfigSection): string[] {
	return getSectionKeyAliases(section).map((sectionKey) => buildSearchRegistryKey(sectionKey));
}

function getStoredFaceKeys(section: ConfigSection, filePath: string[]): string[] {
	const relativePath = filePath.join("/");
	return getSectionKeyAliases(section).map((sectionKey) =>
		buildStoredFaceKey(sectionKey, relativePath),
	);
}

function getFaceRegistryKeys(section: ConfigSection): string[] {
	return getSectionKeyAliases(section).map((sectionKey) => buildFaceRegistryKey(sectionKey));
}

function stripStoredFaceFields(metaEntry: StoredDirectoryMetaEntry): StoredDirectoryMetaEntry {
	const { faces: _faces, personNames: _personNames, ...rest } = metaEntry;
	return rest as StoredDirectoryMetaEntry;
}

function mergeStoredMetaWithFaceData(
	metaEntry: StoredDirectoryMetaEntry | null,
	faceMeta: StoredFaceMetadata | null,
): StoredDirectoryMetaEntry | null {
	if (!metaEntry && !faceMeta) {
		return null;
	}

	const nextMeta: StoredDirectoryMetaEntry = {
		...(metaEntry ?? {}),
		COMPUTED: metaEntry?.COMPUTED ?? {},
	};
	if (faceMeta?.faces?.length) {
		nextMeta.faces = faceMeta.faces;
	}

	const personNames = normalizeStoredPersonNames(
		faceMeta?.personNames ??
			faceMeta?.faces
				?.map((face) => face.personName)
				.filter((value): value is string => typeof value === "string" && value.length > 0),
	);
	if (personNames.length > 0) {
		nextMeta.personNames = personNames;
	}

	return nextMeta;
}

function normalizeStoredFaceMetadata(value: unknown): StoredFaceMetadata {
	if (!value || typeof value !== "object") {
		return {};
	}

	const record = value as Record<string, unknown>;
	const nextValue: StoredFaceMetadata = {};
	if (typeof record.model === "string" && record.model.length > 0) {
		nextValue.model = record.model;
	}
	if (typeof record.analyzedAt === "string" && record.analyzedAt.length > 0) {
		nextValue.analyzedAt = record.analyzedAt;
	}
	if (typeof record.imageSha1 === "string" && record.imageSha1.length > 0) {
		nextValue.imageSha1 = record.imageSha1;
	}

	const faces = normalizeStoredFaceMatches(record.faces);
	if (faces.length > 0) {
		nextValue.faces = faces;
	}

	const personNames = normalizeStoredPersonNames(record.personNames);
	if (personNames.length > 0) {
		nextValue.personNames = personNames;
	}

	return nextValue;
}

function normalizeStoredFaceMatches(value: unknown): StoredFaceMatch[] {
	if (!Array.isArray(value)) {
		return [];
	}

	return value.flatMap((candidate, index) => {
		if (!candidate || typeof candidate !== "object") {
			return [];
		}

		const record = candidate as Record<string, unknown>;
		const box = normalizeStoredFaceBoundingBox(record.box);
		if (!box) {
			return [];
		}

		const nextFace: StoredFaceMatch = {
			faceId:
				typeof record.faceId === "string" && record.faceId.length > 0
					? record.faceId
					: `face-${index + 1}`,
			box,
		};
		if (typeof record.detectorScore === "number" && Number.isFinite(record.detectorScore)) {
			nextFace.detectorScore = record.detectorScore;
		}
		if (typeof record.matchScore === "number" && Number.isFinite(record.matchScore)) {
			nextFace.matchScore = record.matchScore;
		}
		if (typeof record.personId === "string" && record.personId.length > 0) {
			nextFace.personId = record.personId;
		}
		if (typeof record.personName === "string" && record.personName.trim().length > 0) {
			nextFace.personName = record.personName.trim();
		}
		return [nextFace];
	});
}

function normalizeStoredFaceBoundingBox(value: unknown) {
	if (!value || typeof value !== "object") {
		return null;
	}

	const record = value as Record<string, unknown>;
	const x = normalizeFiniteNumber(record.x);
	const y = normalizeFiniteNumber(record.y);
	const width = normalizeFiniteNumber(record.width);
	const height = normalizeFiniteNumber(record.height);
	if (x === null || y === null || width === null || height === null) {
		return null;
	}

	return { x, y, width, height };
}

function normalizeStoredPersonNames(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}

	return [
		...new Set(
			value
				.filter((candidate): candidate is string => typeof candidate === "string")
				.map((candidate) => candidate.trim())
				.filter((candidate) => candidate.length > 0),
		),
	];
}

function normalizeFiniteNumber(value: unknown) {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function listStoredMetaFilePaths(section: ConfigSection): Promise<string[][]> {
	const client = await getThumbKvClient();
	if (!client) {
		return [];
	}

	const entries = new Set<string>();
	for (const registryKey of getSearchRegistryKeys(section)) {
		const members = await client.sMembers(registryKey);
		for (const member of members) {
			if (typeof member === "string" && member.length > 0) {
				entries.add(member);
			}
		}
	}
	for (const registryKey of getFaceRegistryKeys(section)) {
		const members = await client.sMembers(registryKey);
		for (const member of members) {
			if (typeof member === "string" && member.length > 0) {
				entries.add(member);
			}
		}
	}

	return [...entries]
		.map((entry) => entry.split("/").filter(Boolean))
		.filter((entry) => entry.length > 0);
}

export function getStoredMetaDate(
	fullPath: string,
	metaEntry?: StoredDirectoryMetaEntry | null,
): string | undefined {
	const storedDate = parseDayKey(typeof metaEntry?.date === "string" ? metaEntry.date : "");
	if (storedDate) {
		return storedDate;
	}
	const inferredDate = getFileDate(fullPath, null);
	return inferredDate ? formatDayKey(inferredDate) : undefined;
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

export function normalizeStoredGps(value: unknown): FileGpsCoordinates | undefined {
	if (!value || typeof value !== "object") {
		return undefined;
	}
	const candidate = value as Partial<FileGpsCoordinates>;
	const latitude = normalizeCoordinate(candidate.latitude);
	const longitude = normalizeCoordinate(candidate.longitude);
	if (latitude === null || longitude === null) {
		return undefined;
	}
	return { latitude, longitude };
}

export function geocodeGpsCoordinates(
	gps: FileGpsCoordinates | null | undefined,
): FileLocationLabel | undefined {
	if (!gps) {
		return undefined;
	}
	return reverseGeocodeLocation(gps) ?? undefined;
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
	options: {
		sourceBuffer?: Buffer;
		phashSourceBuffer?: Buffer;
		existingMeta?: StoredDirectoryMetaEntry | null;
		onPhashTiming?: (timing: {
			label: string;
			status: "done" | "failed" | "skipped";
			durationMs: number;
			detail?: string;
		}) => void;
	} = {},
): Promise<ThumbImageMetaData> {
	invariant(section.path, "section.path");
	const fullPath = joinSectionPath(section.path, filePath);
	const sourceInput = options.sourceBuffer ?? fullPath;
	const dimensions = await getImageDimensions(sourceInput);
	const gps = await extractGpsCoordinates(sourceInput);
	const location = geocodeGpsCoordinates(gps);
	const existingMeta = options.existingMeta ?? (await readStoredMetaForFile(section, filePath));
	const description = normalizeStoredDescription(existingMeta?.description);
	const phashSourceBuffer = options.phashSourceBuffer ?? options.sourceBuffer;
	const phash = await buildImagePhash(fullPath, phashSourceBuffer, existingMeta, options.onPhashTiming);
	const storedDate = getStoredMetaDate(fullPath, existingMeta);

	return {
		FileName: path.basename(fullPath),
		MimeType: mime.lookup(fullPath),
		FileSize: options.sourceBuffer?.length ?? fs.statSync(fullPath).size,
		date: storedDate,
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

async function buildImagePhash(
	fullPath: string,
	phashSourceBuffer: Buffer | undefined,
	existingMeta: StoredDirectoryMetaEntry | null,
	onPhashTiming?: (timing: {
		label: string;
		status: "done" | "failed" | "skipped";
		durationMs: number;
		detail?: string;
	}) => void,
) {
	if (phashSourceBuffer) {
		const startedAt = Date.now();
		const phashFromBuffer = await buildPerceptualHashFromBuffer(phashSourceBuffer);
		onPhashTiming?.({
			label: "calculate pHash from thumbnail",
			status: phashFromBuffer ? "done" : "failed",
			durationMs: Date.now() - startedAt,
			detail: phashFromBuffer ? undefined : "thumbnail hash failed",
		});
		if (phashFromBuffer) {
			return phashFromBuffer;
		}
	}

	const startedAt = Date.now();
	const phashFromFile = await buildPerceptualHashFromFile(fullPath);
	onPhashTiming?.({
		label: "calculate pHash from source",
		status: phashFromFile ? "done" : "failed",
		durationMs: Date.now() - startedAt,
		detail: phashFromFile ? undefined : "source hash failed",
	});
	if (phashFromFile) {
		return phashFromFile;
	}

	const storedPhash = normalizeStoredPhash(existingMeta?.phash);
	if (storedPhash) {
		onPhashTiming?.({
			label: "calculate pHash",
			status: "skipped",
			durationMs: 0,
			detail: "using stored pHash",
		});
	}
	return storedPhash;
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

async function getImageDimensions(input: string | Buffer) {
	try {
		const metadata = await sharp(input).metadata();
		const width = metadata.width ?? fallbackDimensions.width;
		const height = metadata.height ?? fallbackDimensions.height;
		const orientation = metadata.orientation;
		const shouldSwapSides = orientation !== undefined && orientation >= 5 && orientation <= 8;
		return {
			width: shouldSwapSides ? height : width,
			height: shouldSwapSides ? width : height,
		};
	} catch {
		const fileBuffer = Buffer.isBuffer(input) ? input : fs.readFileSync(input);
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

async function extractGpsCoordinates(input: string | Buffer): Promise<FileGpsCoordinates | null> {
	try {
		const gps = await exifr.gps(input);
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

export async function buildPerceptualHashFromFile(fullPath: string): Promise<string | null> {
	try {
		return await buildPerceptualHashFromSharpInput(fullPath);
	} catch {
		return null;
	}
}

export async function buildPerceptualHashFromBuffer(buffer: Buffer): Promise<string | null> {
	try {
		return await buildPerceptualHashFromSharpInput(buffer);
	} catch {
		return null;
	}
}

async function buildPerceptualHashFromSharpInput(input: string | Buffer) {
	const buffer = await sharp(input)
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
