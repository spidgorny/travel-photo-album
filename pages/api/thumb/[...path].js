import config from "../../../config.json";
import fs from "fs";
import mime from "mime-types";
import { joinSectionPath } from "../../../lib/files.mjs";
import path from "path";
import sharp from "sharp";
import FfmpegCommand from "fluent-ffmpeg";

export default async function handler(req, res) {
	try {
		let [sectionId, ...filePath] = req.query.path;
		const section = config.sections[sectionId];

		let streamInfo;
		if (isVideo(filePath.join("/"))) {
			streamInfo = await makeVideoThumb(section, filePath);
		} else {
			try {
				streamInfo = tryThumbFile(section, filePath);
			} catch (e) {
				if (!e.message.startsWith("ENOENT")) {
					throw e;
				}
				try {
					streamInfo = tryThumbFileWebp(section, filePath);
				} catch (e) {
					if (!e.message.startsWith("ENOENT")) {
						throw e;
					}
					streamInfo = await tryToResize(section, filePath);
				}
			}
		}

		console.log("responsing");
		res.setHeader("Content-Type", streamInfo.mimeType);
		Object.entries(streamInfo.headers).forEach(([key, val]) =>
			res.setHeader(key, val)
		);
		res.status(200);
		res.setHeader("Cache-Control", "s-maxage=86400, public");
		streamInfo.stream.pipe(res);
	} catch (e) {
		res.status(500).json({
			status: "error",
			message: e.message,
			stack: e?.stack?.split("\n"),
		});
	}
}

function tryThumbFile(section, filePath, replaceExt = null) {
	console.log("tryThumbFile", filePath.join("/"), replaceExt);
	let thumbPath = joinSectionPath(section.thumbPath, filePath);
	if (replaceExt) {
		thumbPath = thumbPath.replace(path.extname(thumbPath), replaceExt);
	}
	// console.log(fullPath);
	fs.accessSync(thumbPath, fs.constants.R_OK);
	const mimeType = mime.lookup(thumbPath);
	console.log({ mimeType });
	const stream = fs.createReadStream(thumbPath);
	return {
		mimeType,
		stream,
		headers: { "X-Thumb": "from " + replaceExt ?? "jpg" },
	};
}

function tryThumbFileWebp(section, filePath) {
	console.log("tryThumbFileWebp", filePath.join("/"));
	return tryThumbFile(section.thumbPath, filePath, ".webp");
}

async function tryToResize(section, filePath) {
	console.log("tryToResize", filePath.join("/"));
	const largeFile = joinSectionPath(section.path, filePath);
	const thumbFile = joinSectionPath(section.thumbPath, filePath);
	const largeSize = fs.statSync(largeFile)?.size;
	console.log("resizing", largeFile, largeSize, "=>", thumbFile);
	fs.mkdirSync(path.dirname(thumbFile), { recursive: true });
	await sharp(largeFile).resize({ width: 256 }).toFile(thumbFile);
	console.log("new file", fs.statSync(thumbFile)?.size);
	const mimeType = mime.lookup(thumbFile);
	const stream = fs.createReadStream(thumbFile);
	return {
		mimeType,
		stream,
		headers: { "X-Thumb": "resize" },
	};
}

function isVideo(fullPath) {
	return fullPath.toLowerCase().endsWith("mp4");
}

async function makeVideoThumb(section, filePath) {
	console.log("makeVideoThumb", filePath.join("/"));
	return new Promise((resolve, reject) => {
		try {
			resolve(tryThumbFile(section, filePath, ".webp"));
		} catch (e) {
			let fullPath = joinSectionPath(section.path, filePath);
			let thumbPath = joinSectionPath(section.thumbPath, filePath);
			console.log({ fullPath, thumbPath });
			let screenshotConfig = {
				count: 1,
				folder: path.dirname(thumbPath),
				filename: path.basename(thumbPath),
				size: "320x240",
				timestamps: ["50%"],
			};
			console.log(screenshotConfig);
			new FfmpegCommand(fullPath)
				.screenshots(screenshotConfig)
				.on("end", async (data) => {
					const mimeType = mime.lookup(thumbPath);
					fs.accessSync(thumbPath, fs.constants.R_OK);
					const stream = fs.createReadStream(thumbPath);
					resolve({ mimeType, stream, headers: { "X-Thumb": "ffmpeg" } });
				});
		}
	});
}
