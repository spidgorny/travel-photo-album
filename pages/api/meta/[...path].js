import fs from "fs";
import mime from "mime-types";
import sizeOf from "image-size";
import { promisify } from "util";
import config from "../../../config.json";
import { joinSectionPath } from "../../../lib/files.mjs";
import path from "path";
import { ThumbQueue } from "../../../lib/thumb-queue.mjs";
import { error } from "next/dist/build/output/log";
import invariant from "tiny-invariant";

export default async function handler(req, res) {
	try {
		let [sectionId, ...filePath] = req.query.path;
		const section = config.sections[sectionId];

		let metaData = await getMetaByJson(section, filePath);
		if (!metaData) {
			metaData = await getMetaByFile(section, filePath);
		}

		res.setHeader("Cache-Control", "s-maxage=86400, public");
		res.status(200).json(metaData);
	} catch (e) {
		console.error(e);
		if (error.message === "MP4 preview") {
			res.json({
				MimeType: "mp4",
				thumbnail:
					"https://www.free-codecs.com/pictures/screenshots/mp4_splitter.jpg",
				COMPUTED: {
					Width: 3,
					Height: 2,
				},
			});
		}
		res.status(500).json({
			status: "error",
			message: e.message,
			stack: e.stack.split("\n"),
		});
	}
}

async function getMetaByJson(section, filePath) {
	invariant(section.thumbPath, "section.thumbPath");
	invariant(filePath, "filePath");
	let fullPath = joinSectionPath(section.thumbPath, filePath);
	// const path = '//' + req.query.path.join('/');
	console.log("getMetaByJson", fullPath);

	const metaFile = path.posix.join(path.dirname(fullPath), "meta.json");
	try {
		console.log({ metaFile, stat: fs.statSync(metaFile) });
		fs.accessSync(metaFile, fs.constants.F_OK);
		const dirMeta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
		let fileBaseName = path.basename(fullPath);
		const fileMeta = dirMeta[fileBaseName];
		console.log({ keys: Object.keys(dirMeta), fileBaseName, fileMeta });
		return {
			...fileMeta,
			width: fileMeta.COMPUTED.Width,
			height: fileMeta.COMPUTED.Height,
		};
	} catch (e) {
		console.error(e);
		return null;
	}
}

async function getMetaByFile(section, filePath) {
	// we get metadata from the original file, not the thumbnail
	let fullPath = joinSectionPath(section.path, filePath);
	// const path = '//' + req.query.path.join('/');
	console.log("getMetaByFile", fullPath);
	if (fullPath.toLowerCase().endsWith("mp4")) {
		throw new Error("MP4 preview");
	}
	const mimeType = mime.lookup(fullPath);
	// console.log(mimeType);

	const sizeOfAsync = promisify(sizeOf);
	const dimensions = await sizeOfAsync(fullPath);

	let metaData = {
		FileName: path.basename(fullPath),
		MimeType: mimeType,
		FileSize: fs.statSync(fullPath).size,
		COMPUTED: {
			Width: dimensions.width,
			Height: dimensions.height,
		},
		dimensions,
	};

	const q = new ThumbQueue();
	await q.enqueue({ action: "get-meta-for-file", section, filePath, metaData });

	return metaData;
}
