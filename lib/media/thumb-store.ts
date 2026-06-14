// @ts-nocheck
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import sizeOf from "image-size";
import mime from "mime-types";
import sharp from "sharp";
import FfmpegCommand from "fluent-ffmpeg";
import invariant from "tiny-invariant";
import { createClient } from "redis";
import { joinSectionPath } from "../media/files.ts";

export const thumbKvUrl = process.env.THUMB_KV_URL?.trim() || "";
export const thumbKvPrefix =
	process.env.THUMB_KV_PREFIX?.trim() || "travel-photo-album:thumb:v1";
const defaultThumbnailWidth = 256;
const parsedThumbnailWidth = Number(
	process.env.THUMB_TARGET_WIDTH ?? defaultThumbnailWidth,
);
export const thumbnailTargetWidth =
	Number.isFinite(parsedThumbnailWidth) && parsedThumbnailWidth > 0
		? parsedThumbnailWidth
		: defaultThumbnailWidth;
export const videoThumbnailFrameCount = 10;
export const defaultVideoThumbnailFrameIndex = Math.floor(videoThumbnailFrameCount / 2);

let thumbKvClientPromise = null;
let thumbKvDisabled = !thumbKvUrl;
let thumbKvWarningWasShown = false;
const defaultDominantColor = "#0f172a";
const videoFrameVariantPattern = /:frame-(\d+)$/;

function warnThumbKv(message, error = null) {
	if (thumbKvWarningWasShown) {
		return;
	}
	thumbKvWarningWasShown = true;
	console.warn("thumb-kvrocks", message, error?.message ?? "");
}

function buildThumbHash(sectionName, filePath, variant = `w${thumbnailTargetWidth}-jpeg`) {
	const shasum = crypto.createHash("sha1");
	return shasum
		.update(JSON.stringify({ sectionName, filePath: filePath.join("/"), variant }))
		.digest("hex");
}

function buildThumbKeys(sectionName, filePath, variant) {
	const hash = buildThumbHash(sectionName, filePath, variant);
	return {
		blobKey: `${thumbKvPrefix}:blob:${hash}`,
		metaKey: `${thumbKvPrefix}:meta:${hash}`,
	};
}

function normalizeThumbVariant(variant = `w${thumbnailTargetWidth}-jpeg`) {
	return typeof variant === "string" && variant.trim().length
		? variant.trim()
		: `w${thumbnailTargetWidth}-jpeg`;
}

function parseRequestedVideoVariant(variant, frameIndex) {
	const normalizedVariant = normalizeThumbVariant(variant);
	const matchedFrame = normalizedVariant.match(videoFrameVariantPattern);
	const baseVariant = matchedFrame
		? normalizedVariant.slice(0, -matchedFrame[0].length)
		: normalizedVariant;
	const resolvedFrameIndex = clampVideoFrameIndex(
		frameIndex ?? (matchedFrame ? Number(matchedFrame[1]) : defaultVideoThumbnailFrameIndex),
	);
	return {
		baseVariant,
		frameIndex: resolvedFrameIndex,
		requestedVariant: buildVideoFrameVariant(baseVariant, resolvedFrameIndex),
	};
}

function buildVideoFrameVariant(variant, frameIndex) {
	return `${normalizeThumbVariant(variant)}:frame-${clampVideoFrameIndex(frameIndex)}`;
}

function clampVideoFrameIndex(frameIndex) {
	const parsedFrameIndex = Number(frameIndex);
	if (!Number.isInteger(parsedFrameIndex)) {
		return defaultVideoThumbnailFrameIndex;
	}
	return Math.max(0, Math.min(videoThumbnailFrameCount - 1, parsedFrameIndex));
}

function getTargetWidthForVariant(variant) {
	const matchedWidth = normalizeThumbVariant(variant).match(/^w(\d+)/i);
	const width = matchedWidth ? Number(matchedWidth[1]) : thumbnailTargetWidth;
	return Number.isFinite(width) && width > 0 ? width : thumbnailTargetWidth;
}

// Canonical set of supported media extensions (lowercase, no dot prefix).
// Add new formats here — this list is the single source of truth for what
// the warmup scanner, thumb worker, and gallery will process.
export const SUPPORTED_IMAGE_EXTENSIONS = new Set([
	"jpg", "jpeg", "png", "gif", "webp",
	"heic", "heif",
	"tiff", "tif",
	"bmp",
	"avif",
	"dng", "cr2", "nef", "arw", "orf", "rw2", "pef", "sr2",
]);

export const SUPPORTED_VIDEO_EXTENSIONS = new Set([
	"mp4", "mov", "avi", "mkv",
]);

export const SUPPORTED_MEDIA_EXTENSIONS = new Set([
	...SUPPORTED_IMAGE_EXTENSIONS,
	...SUPPORTED_VIDEO_EXTENSIONS,
]);

export function isSupportedMediaPath(filePath: string[]): boolean {
	const ext = filePath[filePath.length - 1].split(".").pop()?.toLowerCase() ?? "";
	return SUPPORTED_MEDIA_EXTENSIONS.has(ext);
}

export function isVideoPath(filePath) {
	const ext = filePath[filePath.length - 1].split(".").pop()?.toLowerCase() ?? "";
	return SUPPORTED_VIDEO_EXTENSIONS.has(ext);
}

export function getMediaKind(filePath) {
	const ext = filePath[filePath.length - 1].split(".").pop()?.toLowerCase() ?? "";
	if (SUPPORTED_VIDEO_EXTENSIONS.has(ext)) return "video";
	if (SUPPORTED_IMAGE_EXTENSIONS.has(ext)) return "image";
	return "unsupported";
}

export function isImagePath(filePath) {
	return getMediaKind(filePath) === "image";
}

function parseNumber(value, fallback = null) {
	if (value === undefined || value === null || value === "") {
		return fallback;
	}
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
}

function rgbToHex(red, green, blue) {
	return `#${[red, green, blue]
		.map((channel) =>
			Math.max(0, Math.min(255, Math.round(channel)))
				.toString(16)
				.padStart(2, "0"),
		)
		.join("")}`;
}

async function getDominantColorFromFile(fullPath) {
	try {
		const { dominant } = await sharp(fullPath)
			.resize(32, 32, { fit: "inside" })
			.stats();
		return rgbToHex(dominant.r, dominant.g, dominant.b);
	} catch {
		return defaultDominantColor;
	}
}

async function getDominantColorFromBuffer(buffer) {
	try {
		const { dominant } = await sharp(buffer).stats();
		return rgbToHex(dominant.r, dominant.g, dominant.b);
	} catch {
		return defaultDominantColor;
	}
}

export async function getThumbKvClient() {
	if (thumbKvDisabled) {
		return null;
	}
	if (!thumbKvClientPromise) {
		const client = createClient({
			url: thumbKvUrl,
			socket: {
				connectTimeout: 1000,
				reconnectStrategy: false,
			},
		});
		client.on("error", (error) => {
			thumbKvDisabled = true;
			warnThumbKv("disabling kvrocks thumbnail store", error);
		});
		thumbKvClientPromise = client
			.connect()
			.then(() => client)
			.catch((error) => {
				thumbKvDisabled = true;
				warnThumbKv("kvrocks unavailable, using on-demand thumbnails only", error);
				return null;
			});
	}
	return thumbKvClientPromise;
}

export async function closeThumbKvClient() {
	if (!thumbKvClientPromise) {
		return;
	}
	const client = await thumbKvClientPromise;
	thumbKvClientPromise = null;
	if (!client) {
		return;
	}
	await client.quit().catch(() => {});
}

async function getThumbMeta(sectionName, filePath, variant) {
	const client = await getThumbKvClient();
	if (!client) {
		return null;
	}
	try {
		const { metaKey } = buildThumbKeys(sectionName, filePath, variant);
		const meta = await client.hGetAll(metaKey);
		if (!meta || !Object.keys(meta).length) {
			return null;
		}
		return meta;
	} catch (error) {
		thumbKvDisabled = true;
		warnThumbKv("failed reading thumbnail metadata", error);
		return null;
	}
}

export async function getStoredThumbMetaEntry(sectionName, filePath, variant) {
	const meta = await getThumbMeta(sectionName, filePath, variant);
	if (!meta) {
		return null;
	}
	return {
		mimeType: meta.mimeType || "image/jpeg",
		width: parseNumber(meta.originalWidth, 3),
		height: parseNumber(meta.originalHeight, 2),
		dominantColor: meta.dominantColor || defaultDominantColor,
		updatedAt: meta.updatedAt || null,
	};
}

async function setThumbMeta(sectionName, filePath, metadata, variant) {
	const client = await getThumbKvClient();
	if (!client) {
		return;
	}
	try {
		const { metaKey } = buildThumbKeys(sectionName, filePath, variant);
		const normalized = Object.fromEntries(
			Object.entries(metadata).filter(([, value]) => value !== undefined && value !== null),
		);
		if (!Object.keys(normalized).length) {
			return;
		}
		await client.hSet(metaKey, normalized);
	} catch (error) {
		thumbKvDisabled = true;
		warnThumbKv("failed writing thumbnail metadata", error);
	}
}

export async function getStoredThumb(sectionName, filePath, variant) {
	const client = await getThumbKvClient();
	if (!client) {
		return null;
	}
	try {
		const { blobKey } = buildThumbKeys(sectionName, filePath, variant);
		const [encoded, meta] = await Promise.all([
			client.get(blobKey),
			getThumbMeta(sectionName, filePath, variant),
		]);
		if (!encoded) {
			return null;
		}
		return {
			buffer: Buffer.from(encoded, "base64"),
			mimeType: meta?.mimeType || "image/jpeg",
			width: parseNumber(meta?.originalWidth, 3),
			height: parseNumber(meta?.originalHeight, 2),
			dominantColor: meta?.dominantColor || defaultDominantColor,
		};
	} catch (error) {
		thumbKvDisabled = true;
		warnThumbKv("failed reading thumbnail blob", error);
		return null;
	}
}

export async function storeThumb(sectionName, filePath, thumb, variant) {
	const client = await getThumbKvClient();
	if (!client) {
		return false;
	}
	try {
		const { blobKey } = buildThumbKeys(sectionName, filePath, variant);
		await client.set(blobKey, thumb.buffer.toString("base64"));
		await setThumbMeta(
			sectionName,
			filePath,
			{
				mimeType: thumb.mimeType,
				originalWidth:
					thumb.width !== undefined && thumb.width !== null ? String(thumb.width) : undefined,
				originalHeight:
					thumb.height !== undefined && thumb.height !== null
						? String(thumb.height)
						: undefined,
				dominantColor: thumb.dominantColor ?? undefined,
				updatedAt: new Date().toISOString(),
			},
			variant,
		);
		return true;
	} catch (error) {
		thumbKvDisabled = true;
		warnThumbKv("failed writing thumbnail blob", error);
		return false;
	}
}

export async function getStoredDimensions(sectionName, filePath, variant) {
	const meta = await getThumbMeta(sectionName, filePath, variant);
	if (!meta) {
		return null;
	}
	const width = parseNumber(meta.originalWidth);
	const height = parseNumber(meta.originalHeight);
	if (!width || !height) {
		return null;
	}
	return {
		width,
		height,
		mimeType: meta.mimeType || null,
		dominantColor: meta.dominantColor || defaultDominantColor,
	};
}

export async function storeDimensions(sectionName, filePath, dimensions, variant) {
	await setThumbMeta(
		sectionName,
		filePath,
		{
			originalWidth: String(dimensions.width),
			originalHeight: String(dimensions.height),
			mimeType: dimensions.mimeType ?? undefined,
			dominantColor: dimensions.dominantColor ?? undefined,
			updatedAt: new Date().toISOString(),
		},
		variant,
	);
}

function getDimensionsFromJson(section, filePath) {
	if (!section.thumbPath) {
		return null;
	}
	try {
		const fullPath = joinSectionPath(section.thumbPath, filePath);
		const metaFile = path.posix.join(path.dirname(fullPath), "meta.json");
		fs.accessSync(metaFile, fs.constants.F_OK);
		const dirMeta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
		const fileMeta = dirMeta[path.basename(fullPath)];
		if (!fileMeta?.COMPUTED?.Width || !fileMeta?.COMPUTED?.Height) {
			return null;
		}
		return {
			width: fileMeta.COMPUTED.Width,
			height: fileMeta.COMPUTED.Height,
			mimeType: mime.lookup(fullPath) || null,
			dominantColor: null,
		};
	} catch {
		return null;
	}
}

function getDimensionsFromFile(section, filePath) {
	invariant(section.path, "section.path");
	const fullPath = joinSectionPath(section.path, filePath);
	const dimensions = sizeOf(fs.readFileSync(fullPath));
	const orientation = dimensions.orientation;
	const shouldSwapSides = orientation && orientation >= 5 && orientation <= 8;
	return {
		width: shouldSwapSides ? (dimensions.height ?? 2) : (dimensions.width ?? 3),
		height: shouldSwapSides ? (dimensions.width ?? 3) : (dimensions.height ?? 2),
		mimeType: mime.lookup(fullPath) || null,
		dominantColor: null,
	};
}

async function getDominantColor(section, filePath) {
	if (section.thumbPath) {
		const jpegThumb = joinSectionPath(section.thumbPath, filePath);
		const webpThumb = jpegThumb.replace(path.extname(jpegThumb), ".webp");
		for (const candidate of [jpegThumb, webpThumb]) {
			try {
				fs.accessSync(candidate, fs.constants.R_OK);
				return await getDominantColorFromFile(candidate);
			} catch {}
		}
	}
	invariant(section.path, "section.path");
	return getDominantColorFromFile(joinSectionPath(section.path, filePath));
}

async function getDimensionsFromBuffer(buffer) {
	try {
		const metadata = await sharp(buffer).metadata();
		const width = metadata.width ?? 3;
		const height = metadata.height ?? 2;
		const orientation = metadata.orientation;
		const shouldSwapSides = orientation && orientation >= 5 && orientation <= 8;
		return {
			width: shouldSwapSides ? height : width,
			height: shouldSwapSides ? width : height,
			mimeType: null,
			dominantColor: null,
		};
	} catch {
		const dimensions = sizeOf(buffer);
		const orientation = dimensions.orientation;
		const shouldSwapSides = orientation && orientation >= 5 && orientation <= 8;
		return {
			width: shouldSwapSides ? (dimensions.height ?? 2) : (dimensions.width ?? 3),
			height: shouldSwapSides ? (dimensions.width ?? 3) : (dimensions.height ?? 2),
			mimeType: null,
			dominantColor: null,
		};
	}
}

export async function getImageDimensions(
	section,
	filePath,
	variant = `w${thumbnailTargetWidth}-jpeg`,
	sourceBuffer = undefined,
	{ kvOnly = false } = {},
) {
	if (isVideoPath(filePath)) {
		return {
			width: 16,
			height: 9,
			mimeType: mime.lookup(filePath.join("/")) || null,
			dominantColor: defaultDominantColor,
		};
	}
	const cached = await getStoredDimensions(section.name, filePath, variant);
	if (cached) {
		return cached;
	}
	// When kvOnly, don't read the NAS — return a placeholder so the gallery
	// can render with a default aspect ratio while warmup runs in the background.
	if (kvOnly) {
		return {
			width: 3,
			height: 2,
			mimeType: mime.lookup(filePath.join("/")) || null,
			dominantColor: defaultDominantColor,
		};
	}
	const discovered =
		getDimensionsFromJson(section, filePath) ??
		(sourceBuffer ? await getDimensionsFromBuffer(sourceBuffer) : getDimensionsFromFile(section, filePath));
	const dominantColor = discovered.dominantColor ??
		(sourceBuffer ? await getDominantColorFromBuffer(sourceBuffer) : await getDominantColor(section, filePath));
	const enriched = {
		...discovered,
		dominantColor,
	};
	await storeDimensions(section.name, filePath, enriched, variant);
	return enriched;
}

export async function ensureImageThumb(
	section,
	filePath,
	variant = `w${thumbnailTargetWidth}-jpeg`,
	sourceBuffer = undefined,
) {
	invariant(!isVideoPath(filePath), "ensureImageThumb only supports image files");
	const cached = await getStoredThumb(section.name, filePath, variant);
	if (cached) {
		return {
			...cached,
			source: "kvrocks",
		};
	}
	const thumb = await buildGeneratedImageThumb(section, filePath, variant, sourceBuffer);
	await storeThumb(section.name, filePath, thumb, variant);
	return {
		...thumb,
		source: "generated",
	};
}

export async function buildGeneratedImageThumb(
	section,
	filePath,
	variant = `w${thumbnailTargetWidth}-jpeg`,
	sourceBuffer = undefined,
) {
	invariant(!isVideoPath(filePath), "buildGeneratedImageThumb only supports image files");
	invariant(section.path, "section.path");
	const fullPath = joinSectionPath(section.path, filePath);
	const sourceInput = sourceBuffer ?? fullPath;
	const dimensions = await getImageDimensions(section, filePath, variant, sourceBuffer);
	const buffer = await sharp(sourceInput)
		.rotate()
		.resize({ width: thumbnailTargetWidth })
		.jpeg()
		.toBuffer();
	const dominantColor = await getDominantColorFromBuffer(buffer);
	return {
		buffer,
		mimeType: "image/jpeg",
		width: dimensions.width,
		height: dimensions.height,
		dominantColor,
	};
}

function getThumbFilePath(thumbRoot, filePath, replaceExt = null) {
	let thumbPath = joinSectionPath(thumbRoot, filePath);
	if (replaceExt) {
		thumbPath = thumbPath.replace(path.extname(thumbPath), replaceExt);
	}
	return thumbPath;
}

function getExistingDiskThumb(thumbRoot, filePath, candidates = [null]) {
	for (const candidateExt of candidates) {
		const thumbPath = getThumbFilePath(thumbRoot, filePath, candidateExt);
		try {
			fs.accessSync(thumbPath, fs.constants.R_OK);
			return {
				path: thumbPath,
				mimeType: mime.lookup(thumbPath) || "application/octet-stream",
				source: `existing:${candidateExt ?? (path.extname(thumbPath) || "original")}`,
			};
		} catch {}
	}
	return null;
}

export async function readStoredSectionThumb(
	section,
	filePath,
	variant = `w${thumbnailTargetWidth}-jpeg`,
	frameIndex,
) {
	if (isVideoPath(filePath)) {
		const { requestedVariant } = parseRequestedVideoVariant(variant, frameIndex);
		const cachedVideoThumb = await getStoredThumb(section.name, filePath, requestedVariant);
		if (cachedVideoThumb) {
			return {
				kind: "buffer",
				buffer: cachedVideoThumb.buffer,
				mimeType: cachedVideoThumb.mimeType,
				source: `kvrocks:${requestedVariant}`,
			};
		}
		if (!section.thumbPath) {
			return null;
		}
		const diskVideoThumb = getExistingDiskThumb(section.thumbPath, filePath, [
			".webp",
			".jpg",
			".jpeg",
			null,
		]);
		if (!diskVideoThumb) {
			return null;
		}
		return {
			kind: "buffer",
			buffer: fs.readFileSync(diskVideoThumb.path),
			mimeType: diskVideoThumb.mimeType,
			source: diskVideoThumb.source,
		};
	}

	if (!section.thumbPath) {
		const cachedThumb = await getStoredThumb(section.name, filePath, variant);
		if (!cachedThumb) {
			return null;
		}
		return {
			kind: "buffer",
			buffer: cachedThumb.buffer,
			mimeType: cachedThumb.mimeType,
			source: `kvrocks:${variant}`,
		};
	}

	const diskThumb = getExistingDiskThumb(section.thumbPath, filePath, [null, ".webp"]);
	if (!diskThumb) {
		return null;
	}
	return {
		kind: "buffer",
		buffer: fs.readFileSync(diskThumb.path),
		mimeType: diskThumb.mimeType,
		source: diskThumb.source,
	};
}

export async function hasStoredSectionThumb(section, filePath, variant) {
	if (isVideoPath(filePath)) {
		const { requestedVariant } = parseRequestedVideoVariant(variant);
		const existing = await getStoredThumb(section.name, filePath, requestedVariant);
		if (existing) {
			return true;
		}
		if (!section.thumbPath) {
			return false;
		}
		return Boolean(getExistingDiskThumb(section.thumbPath, filePath, [".webp", ".jpg", ".jpeg", null]));
	}

	if (!section.thumbPath) {
		const existing = await getStoredThumb(section.name, filePath, variant);
		return Boolean(existing);
	}

	const candidates = isVideoPath(filePath) ? [".webp", ".jpg", ".jpeg", null] : [null, ".webp"];
	return Boolean(getExistingDiskThumb(section.thumbPath, filePath, candidates));
}

async function ensureResizedImageThumb(section, filePath, sourceBuffer = undefined) {
	invariant(section.path, "section.path");
	invariant(section.thumbPath, "section.thumbPath");
	const existing = getExistingDiskThumb(section.thumbPath, filePath, [null, ".webp"]);
	if (existing) {
		return existing;
	}

	const largeFile = joinSectionPath(section.path, filePath);
	const thumbFile = getThumbFilePath(section.thumbPath, filePath);
	fs.mkdirSync(path.dirname(thumbFile), { recursive: true });
	const buffer = await sharp(sourceBuffer ?? largeFile)
		.rotate()
		.resize({ width: thumbnailTargetWidth })
		.jpeg()
		.toBuffer();
	fs.writeFileSync(thumbFile, buffer);
	return {
		path: thumbFile,
		mimeType: mime.lookup(thumbFile) || "application/octet-stream",
		source: "generated:resize",
		generatedBuffer: buffer,
	};
}

export async function persistGeneratedImageThumb(
	section,
	filePath,
	thumb,
	variant = `w${thumbnailTargetWidth}-jpeg`,
) {
	if (!section.thumbPath) {
		await storeThumb(section.name, filePath, thumb, variant);
		return {
			kind: "buffer",
			...thumb,
			source: "generated",
		};
	}

	invariant(section.thumbPath, "section.thumbPath");
	const thumbFile = getThumbFilePath(section.thumbPath, filePath);
	fs.mkdirSync(path.dirname(thumbFile), { recursive: true });
	fs.writeFileSync(thumbFile, thumb.buffer);
	return {
		kind: "file",
		path: thumbFile,
		mimeType: mime.lookup(thumbFile) || thumb.mimeType || "application/octet-stream",
		source: "generated:resize",
		generatedBuffer: thumb.buffer,
	};
}

async function ensureVideoThumb(section, filePath) {
	invariant(section.path, "section.path");
	invariant(section.thumbPath, "section.thumbPath");
	const existing = getExistingDiskThumb(section.thumbPath, filePath, [
		".webp",
		".jpg",
		".jpeg",
		null,
	]);
	if (existing) {
		return existing;
	}

	const fullPath = joinSectionPath(section.path, filePath);
	const thumbPath = getThumbFilePath(section.thumbPath, filePath, ".jpg");
	fs.mkdirSync(path.dirname(thumbPath), { recursive: true });

	await new Promise((resolve, reject) => {
		new FfmpegCommand(fullPath)
			.screenshots({
				count: 1,
				folder: path.dirname(thumbPath),
				filename: path.basename(thumbPath),
				size: "320x240",
				timestamps: ["50%"],
			})
			.on("end", resolve)
			.on("error", reject);
	});

	return {
		path: thumbPath,
		mimeType: mime.lookup(thumbPath) || "image/jpeg",
		source: "generated:ffmpeg",
	};
}

async function ensureVideoThumbSet(section, filePath, variant, frameIndex) {
	const { baseVariant, requestedVariant, frameIndex: resolvedFrameIndex } =
		parseRequestedVideoVariant(variant, frameIndex);
	const cached = await getStoredThumb(section.name, filePath, requestedVariant);
	if (cached) {
		return {
			...cached,
			source: `kvrocks:frame-${resolvedFrameIndex}`,
		};
	}

	invariant(section.path, "section.path");
	const fullPath = joinSectionPath(section.path, filePath);
	const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "travel-photo-album-video-thumbs-"));
	const width = getTargetWidthForVariant(baseVariant);

	try {
		await new Promise((resolve, reject) => {
			new FfmpegCommand(fullPath)
				.screenshots({
					folder: tempDirectory,
					filename: "frame-%i.jpg",
					size: `${width}x?`,
					timemarks: buildVideoTimemarks(),
				})
				.on("end", resolve)
				.on("error", reject);
		});

		const generatedFiles = fs
			.readdirSync(tempDirectory)
			.filter((fileName) => fileName.endsWith(".jpg"))
			.sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
		invariant(generatedFiles.length > 0, "ffmpeg did not generate video thumbnails");

		let requestedThumb = null;
		for (const [index, fileName] of generatedFiles.entries()) {
			const generatedPath = path.join(tempDirectory, fileName);
			const buffer = fs.readFileSync(generatedPath);
			const metadata = await sharp(buffer).metadata();
			const thumb = {
				buffer,
				mimeType: "image/jpeg",
				width: metadata.width ?? width,
				height: metadata.height ?? Math.round((width * 9) / 16),
				dominantColor: await getDominantColorFromBuffer(buffer),
			};
			await storeThumb(section.name, filePath, thumb, buildVideoFrameVariant(baseVariant, index));
			if (index === resolvedFrameIndex) {
				requestedThumb = thumb;
			}
		}

		invariant(requestedThumb, "requested video thumbnail frame was not generated");
		return {
			...requestedThumb,
			source: `generated:ffmpeg:${generatedFiles.length}`,
		};
	} catch (error) {
		const fallback = await getStoredThumb(section.name, filePath, requestedVariant);
		if (fallback) {
			return {
				...fallback,
				source: `kvrocks:frame-${resolvedFrameIndex}`,
			};
		}
		throw error;
	} finally {
		fs.rmSync(tempDirectory, { recursive: true, force: true });
	}
}

function buildVideoTimemarks() {
	return Array.from({ length: videoThumbnailFrameCount }, (_, index) => {
		const percentage = Math.min(95, Math.max(5, 5 + index * 10));
		return `${percentage}%`;
	});
}

export async function ensureSectionThumb(
	section,
	filePath,
	variant = `w${thumbnailTargetWidth}-jpeg`,
	frameIndex,
	options = undefined,
) {
	if (isVideoPath(filePath)) {
		try {
			return {
				kind: "buffer",
				...(await ensureVideoThumbSet(section, filePath, variant, frameIndex)),
			};
		} catch (error) {
			if (!section.thumbPath) {
				throw error;
			}
			return {
				kind: "file",
				...(await ensureVideoThumb(section, filePath)),
			};
		}
	}

	if (!section.thumbPath) {
		return {
			kind: "buffer",
			...(await ensureImageThumb(section, filePath, variant, options?.sourceBuffer)),
		};
	}

	return {
		kind: "file",
		...(await ensureResizedImageThumb(section, filePath, options?.sourceBuffer)),
	};
}
