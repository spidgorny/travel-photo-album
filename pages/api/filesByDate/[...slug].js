import invariant from "tiny-invariant";
import { DateTime } from "luxon";
import config from "../../../lib/config.js";
import { isValidDate } from "../../../lib/date.mjs";
import { getFileDates } from "../../../lib/files.mjs";

export default async function handler(req, res) {
	try {
		const slug = Array.isArray(req.query.slug)
			? req.query.slug
			: typeof req.query.slug === "string"
				? [req.query.slug]
				: [];
		const [sectionInput, ...filePathWithDate] = slug;
		const dateInput = filePathWithDate.pop();
		const sectionId = Number(sectionInput ?? req.query.section);
		const section = config.sections?.[sectionId];
		invariant(section, "section");
		invariant(dateInput, "date missing");

		const date = new Date(dateInput);
		invariant(isValidDate(date), "date missing");
		const datePlus1 = new Date(date.getTime() + 1000 * 60 * 60 * 24);

		let files = await getFileDates(section, filePathWithDate);
		files = files.filter((file) => file.date > date && file.date < datePlus1);
		files = files.filter((file) => !file.isDir);

		res.setHeader("Cache-Control", "public, s-maxage=6000");
		res.setHeader("Expires", DateTime.now().plus({ days: 30 }).toHTTP());
		res.status(200).json({ sectionId, section, files });
	} catch (error) {
		res.status(500).json({
			status: "error",
			message: error instanceof Error ? error.message : String(error),
			stack:
				error instanceof Error && error.stack ? error.stack.split("\n") : undefined,
		});
	}
}
