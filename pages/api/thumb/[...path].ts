import type { NextApiHandler } from "next";
import fs from "fs";
import path from "path";
import { Readable } from "stream";
import mime from "mime-types";
import sharp from "sharp";
import FfmpegCommand from "fluent-ffmpeg";
import invariant from "tiny-invariant";
import config from "../../../lib/config.js";
import {
	ensureImageThumb,
	thumbnailTargetWidth,
} from "../../../lib/thumb-store.mjs";
import {
getCatchAllSegments,
getSectionById,
jsonError,
} from "../../../lib/api-route";
import { joinSectionPath } from "../../../lib/files.mjs";

interface StreamInfo {
mimeType: string;
stream: Readable;
headers: Record<string, string>;
}

type ThumbErrorResponse = ReturnType<typeof jsonError>;

const handler: NextApiHandler<ThumbErrorResponse> = async (req, res) => {
	try {
		const [sectionId, ...filePath] = getCatchAllSegments(req.query.path);
		const section = getSectionById(config.sections, sectionId);
		invariant(section, "section");
		invariant(section.path, "section.path");

		let streamInfo: StreamInfo;
		if (isVideo(filePath.join("/"))) {
			if (!section.thumbPath) {
				throw new Error("section.thumbPath is required for video thumbnails");
			}
			streamInfo = await makeVideoThumb(section.path, section.thumbPath, filePath);
		} else if (!section.thumbPath) {
			const generatedThumb = await ensureImageThumb(sectionId, section, filePath);
			streamInfo = {
				mimeType: generatedThumb.mimeType,
				stream: Readable.from(generatedThumb.buffer),
				headers: { "X-Thumb": generatedThumb.source },
			};
		} else {
			try {
				streamInfo = tryThumbFile(section.thumbPath, filePath);
			} catch (error) {
				const err = error instanceof Error ? error : new Error("Unknown error");
				if (!err.message.startsWith("ENOENT")) {
					throw err;
				}
				try {
					streamInfo = tryThumbFile(section.thumbPath, filePath, ".webp");
				} catch (webpError) {
					const err =
						webpError instanceof Error
							? webpError
							: new Error("Unknown error");
					if (!err.message.startsWith("ENOENT")) {
						throw err;
					}
					streamInfo = await tryToResize(section.path, section.thumbPath, filePath);
				}
			}
		}

		res.setHeader("Content-Type", streamInfo.mimeType);
		Object.entries(streamInfo.headers).forEach(([key, value]) => {
			res.setHeader(key, value);
		});
		res.status(200);
		res.setHeader("Cache-Control", "s-maxage=86400, public");
		streamInfo.stream.pipe(res);
	} catch (error) {
		res.status(500).json(jsonError(error));
	}
};

function tryThumbFile(
thumbRoot: string,
filePath: string[],
replaceExt?: string,
): StreamInfo {
let thumbPath = joinSectionPath(thumbRoot, filePath);
if (replaceExt) {
thumbPath = thumbPath.replace(path.extname(thumbPath), replaceExt);
}
fs.accessSync(thumbPath, fs.constants.R_OK);
const mimeType = mime.lookup(thumbPath) || "application/octet-stream";
const stream = fs.createReadStream(thumbPath);
return {
mimeType,
stream,
headers: { "X-Thumb": `from ${replaceExt ?? "jpg"}` },
};
}

async function tryToResize(
sectionPath: string,
thumbRoot: string,
filePath: string[],
): Promise<StreamInfo> {
const largeFile = joinSectionPath(sectionPath, filePath);
const thumbFile = joinSectionPath(thumbRoot, filePath);
fs.mkdirSync(path.dirname(thumbFile), { recursive: true });
await sharp(largeFile).resize({ width: thumbnailTargetWidth }).toFile(thumbFile);
const mimeType = mime.lookup(thumbFile) || "application/octet-stream";
const stream = fs.createReadStream(thumbFile);
return {
mimeType,
stream,
headers: { "X-Thumb": "resize" },
};
}

function isVideo(fullPath: string): boolean {
return fullPath.toLowerCase().endsWith("mp4");
}

async function makeVideoThumb(
sectionPath: string,
thumbRoot: string,
filePath: string[],
): Promise<StreamInfo> {
return new Promise((resolve, reject) => {
	try {
		resolve(tryThumbFile(thumbRoot, filePath, ".webp"));
	} catch {
		const fullPath = joinSectionPath(sectionPath, filePath);
		const thumbPath = joinSectionPath(thumbRoot, filePath);
		const screenshotConfig = {
			count: 1,
			folder: path.dirname(thumbPath),
			filename: path.basename(thumbPath),
			size: "320x240",
			timestamps: ["50%"],
		};
		new FfmpegCommand(fullPath)
			.screenshots(screenshotConfig)
			.on("end", () => {
				const mimeType = mime.lookup(thumbPath) || "application/octet-stream";
				fs.accessSync(thumbPath, fs.constants.R_OK);
				const stream = fs.createReadStream(thumbPath);
				resolve({
					mimeType,
					stream,
					headers: { "X-Thumb": "ffmpeg" },
				});
			})
			.on("error", (error: unknown) => {
				reject(error instanceof Error ? error : new Error("Unknown error"));
			});
	}
});
}

export default handler;
