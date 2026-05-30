import crypto from "crypto";
import fs from "fs";
import path from "path";
import sizeOf from "image-size";
import mime from "mime-types";
import sharp from "sharp";
import invariant from "tiny-invariant";
import { createClient } from "redis";
import { joinSectionPath } from "./files.mjs";

const thumbKvUrl = process.env.THUMB_KV_URL?.trim() || process.env.REDIS_URL?.trim();
const thumbKvPrefix =
	process.env.THUMB_KV_PREFIX?.trim() || "travel-photo-album:thumb:v1";
const defaultThumbnailWidth = 256;
const parsedThumbnailWidth = Number(
	process.env.THUMB_TARGET_WIDTH ?? defaultThumbnailWidth,
);
export const thumbnailTargetWidth =
	Number.isFinite(parsedThumbnailWidth) && parsedThumbnailWidth > 0
		? parsedThumbnailWidth
		: defaultThumbnailWidth;

let thumbKvClientPromise = null;
let thumbKvDisabled = !thumbKvUrl;
let thumbKvWarningWasShown = false;

function warnThumbKv(message, error = null) {
	if (thumbKvWarningWasShown) {
		return;
	}
	thumbKvWarningWasShown = true;
	console.warn("thumb-kvrocks", message, error?.message ?? "");
}

function buildThumbHash(sectionId, filePath, variant = `w${thumbnailTargetWidth}-jpeg`) {
	const shasum = crypto.createHash("sha1");
	return shasum
		.update(JSON.stringify({ sectionId, filePath: filePath.join("/"), variant }))
		.digest("hex");
}

function buildThumbKeys(sectionId, filePath, variant) {
	const hash = buildThumbHash(sectionId, filePath, variant);
	return {
		blobKey: `${thumbKvPrefix}:blob:${hash}`,
		metaKey: `${thumbKvPrefix}:meta:${hash}`,
	};
}

export function isVideoPath(filePath) {
	return /\.(mp4|mov|avi|mkv)$/i.test(filePath.join("/"));
}

function parseNumber(value, fallback = null) {
	if (value === undefined || value === null || value === "") {
		return fallback;
	}
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
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

async function getThumbMeta(sectionId, filePath, variant) {
	const client = await getThumbKvClient();
	if (!client) {
		return null;
	}
	try {
		const { metaKey } = buildThumbKeys(sectionId, filePath, variant);
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

async function setThumbMeta(sectionId, filePath, metadata, variant) {
	const client = await getThumbKvClient();
	if (!client) {
		return;
	}
	try {
		const { metaKey } = buildThumbKeys(sectionId, filePath, variant);
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

export async function getStoredThumb(sectionId, filePath, variant) {
	const client = await getThumbKvClient();
	if (!client) {
		return null;
	}
	try {
		const { blobKey } = buildThumbKeys(sectionId, filePath, variant);
		const [encoded, meta] = await Promise.all([
			client.get(blobKey),
			getThumbMeta(sectionId, filePath, variant),
		]);
		if (!encoded) {
			return null;
		}
		return {
			buffer: Buffer.from(encoded, "base64"),
			mimeType: meta?.mimeType || "image/jpeg",
			width: parseNumber(meta?.originalWidth, 3),
			height: parseNumber(meta?.originalHeight, 2),
		};
	} catch (error) {
		thumbKvDisabled = true;
		warnThumbKv("failed reading thumbnail blob", error);
		return null;
	}
}

export async function storeThumb(sectionId, filePath, thumb, variant) {
	const client = await getThumbKvClient();
	if (!client) {
		return false;
	}
	try {
		const { blobKey } = buildThumbKeys(sectionId, filePath, variant);
		await client.set(blobKey, thumb.buffer.toString("base64"));
		await setThumbMeta(
			sectionId,
			filePath,
			{
				mimeType: thumb.mimeType,
				originalWidth:
					thumb.width !== undefined && thumb.width !== null ? String(thumb.width) : undefined,
				originalHeight:
					thumb.height !== undefined && thumb.height !== null
						? String(thumb.height)
						: undefined,
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

export async function getStoredDimensions(sectionId, filePath, variant) {
	const meta = await getThumbMeta(sectionId, filePath, variant);
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
	};
}

export async function storeDimensions(sectionId, filePath, dimensions, variant) {
	await setThumbMeta(
		sectionId,
		filePath,
		{
			originalWidth: String(dimensions.width),
			originalHeight: String(dimensions.height),
			mimeType: dimensions.mimeType ?? undefined,
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
		};
	} catch {
		return null;
	}
}

function getDimensionsFromFile(section, filePath) {
	invariant(section.path, "section.path");
	const fullPath = joinSectionPath(section.path, filePath);
	const dimensions = sizeOf(fs.readFileSync(fullPath));
	return {
		width: dimensions.width ?? 3,
		height: dimensions.height ?? 2,
		mimeType: mime.lookup(fullPath) || null,
	};
}

export async function getImageDimensions(sectionId, section, filePath, variant) {
	if (isVideoPath(filePath)) {
		return {
			width: 16,
			height: 9,
			mimeType: mime.lookup(filePath.join("/")) || null,
		};
	}
	const cached = await getStoredDimensions(sectionId, filePath, variant);
	if (cached) {
		return cached;
	}
	const discovered =
		getDimensionsFromJson(section, filePath) ?? getDimensionsFromFile(section, filePath);
	await storeDimensions(sectionId, filePath, discovered, variant);
	return discovered;
}

export async function ensureImageThumb(sectionId, section, filePath, variant) {
	invariant(!isVideoPath(filePath), "ensureImageThumb only supports image files");
	const cached = await getStoredThumb(sectionId, filePath, variant);
	if (cached) {
		return {
			...cached,
			source: "kvrocks",
		};
	}
	invariant(section.path, "section.path");
	const fullPath = joinSectionPath(section.path, filePath);
	const dimensions = await getImageDimensions(sectionId, section, filePath, variant);
	const buffer = await sharp(fullPath)
		.resize({ width: thumbnailTargetWidth })
		.jpeg()
		.toBuffer();
	const thumb = {
		buffer,
		mimeType: "image/jpeg",
		width: dimensions.width,
		height: dimensions.height,
	};
	await storeThumb(sectionId, filePath, thumb, variant);
	return {
		...thumb,
		source: "generated",
	};
}
