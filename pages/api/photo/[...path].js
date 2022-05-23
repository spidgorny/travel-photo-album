import config from "../../../config.json";
import fs from "fs";
import mime from "mime-types";
import { joinSectionPath } from "../../../lib/files.mjs";
import invariant from "tiny-invariant";

export default async function handler(req, res) {
	let [sectionId, ...filePath] = req.query.path;
	const section = config.sections[sectionId];
	let fullPath = joinSectionPath(section.path, filePath);
	try {
		invariant(section, "section");
		if (fullPath.toLowerCase().endsWith("mp4")) {
			throw new Error("MP4 preview");
		}
		const mimeType = mime.lookup(fullPath);
		console.log({ fullPath, mimeType });
		res.setHeader("Content-Type", mimeType);
		res.setHeader("Cache-Control", "s-maxage=86400, public");
		console.log({ fullPath });
		const stream = fs.createReadStream(fullPath);
		res.status(200);
		stream.pipe(res);
	} catch (e) {
		res.status(500).json({
			sectionId,
			section,
			fullPath,
			status: "error",
			message: e.message,
			stack: e?.stack?.split("\n"),
		});
	}
}
