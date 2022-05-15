import config from "../../../config.json";
import fs from "fs";
import mime from "mime-types";
import { joinSectionPath } from "../../../lib/files.mjs";

import sizeOf from "image-size";

export default async function handler(req, res) {
	try {
		let [sectionId, ...filePath] = req.query.path;
		const section = config.sections[sectionId];
		let fullPath = joinSectionPath(section, filePath);
		if (fullPath.toLowerCase().endsWith("mp4")) {
			throw new Error("MP4 preview");
		}
		const mimeType = mime.lookup(fullPath);
		console.log({ mimeType });
		const dimensions = sizeOf(fullPath);

		res.setHeader("Content-Type", mimeType);
		res.setHeader("Cache-Control", "s-maxage=86400, public");
		console.log({ fullPath });
		res.status(200).json({
			fullPath,
			mimeType,
			...dimensions,
		});
	} catch (e) {
		res.status(500).json({
			status: "error",
			message: e.message,
			stack: e?.stack?.split("\n"),
		});
	}
}
