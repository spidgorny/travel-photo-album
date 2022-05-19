import config from "../../../config.json";
import invariant from "tiny-invariant";
import { DateTime } from "luxon";
import { getFilteredFiles } from "../../../lib/files.mjs";

export default async function handler(req, res) {
	try {
		const [sectionInput, ...filePath] = req.query.slug;
		const sectionId = Number(sectionInput ?? req.query.section);
		const section = config.sections[sectionId];
		invariant(section);
		const files = await getFilteredFiles(section, filePath);
		// console.log({ files });
		res.setHeader("Cache-Control", "public, s-maxage=6000");
		res.setHeader("Expires", DateTime.now().plus({ days: 30 }).toHTTP());
		res.setHeader("ETag", filePath.join("/"));
		res.status(200).json({ sectionInput, sectionId, section, files });
	} catch (e) {
		console.error(e);
		res
			.status(500)
			.json({ status: "error", message: e.message, stack: e.stack });
	}
}
