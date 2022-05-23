import config from "../../../config.json";
import fs from "fs";
import mime from "mime-types";
import { joinSectionPath } from "../../../lib/files.mjs";
import path from "path";
import sharp from "sharp";

export default async function handler(req, res) {
	try {
		let [sectionId, ...filePath] = req.query.path;
		const section = config.sections[sectionId];

		let stream;
		try {
			stream = tryThumbFile(section, filePath);
		} catch (e) {
			if (!e.message.startsWith("ENOENT")) {
				throw e;
			}
			stream = await tryToResize(section, filePath);
		}

		res.setHeader("Content-Type", stream.mimeType);
		res.status(200);
		res.setHeader("Cache-Control", "s-maxage=86400, public");
		stream.stream.pipe(res);
	} catch (e) {
		res.status(500).json({
			status: "error",
			message: e.message,
			stack: e?.stack?.split("\n"),
		});
	}
}

function tryThumbFile(section, filePath) {
	let fullPath = joinSectionPath(section.thumbPath, filePath);
	console.log({ fullPath });
	if (fullPath.toLowerCase().endsWith("mp4")) {
		throw new Error("MP4 preview");
	}
	const mimeType = mime.lookup(fullPath);
	fs.accessSync(fullPath, fs.constants.R_OK);
	const stream = fs.createReadStream(fullPath);
	return { mimeType, stream };
}

async function tryToResize(section, filePath) {
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
	};
}
