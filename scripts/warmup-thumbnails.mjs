import process from "process";
import invariant from "tiny-invariant";
import config from "../lib/config.js";
import { closeRedisClient } from "../lib/cache.mjs";
import { getFileDates } from "../lib/files.mjs";
import {
	closeThumbKvClient,
	ensureImageThumb,
	getImageDimensions,
	isVideoPath,
} from "../lib/thumb-store.mjs";

async function main() {
	const [sectionInput, ...rest] = process.argv.slice(2);
	invariant(sectionInput, "Usage: npm run warmup:thumbs -- <sectionId> [folder] [date]");
	const sectionId = Number(sectionInput);
	invariant(Number.isInteger(sectionId), "sectionId must be an integer");
	const section = config.sections?.[sectionId];
	invariant(section, "section not found");

	const maybeDate = rest.at(-1);
	const hasDate = Boolean(maybeDate && /^\d{4}-\d{2}-\d{2}$/.test(maybeDate));
	const folderParts = hasDate ? rest.slice(0, -1) : rest;
	const folder = folderParts.join("/");
	const dateFilter = hasDate ? new Date(maybeDate) : null;
	const nextDate = dateFilter
		? new Date(dateFilter.getTime() + 24 * 60 * 60 * 1000)
		: null;

	let files = await getFileDates(section, folderParts);
	files = files.filter((file) => !file.isDir);
	if (dateFilter && nextDate) {
		files = files.filter((file) => file.date > dateFilter && file.date < nextDate);
	}

	for (const file of files) {
		const filePath = String(file.dirPath ?? file.path).split("/");
		await getImageDimensions(sectionId, section, filePath);
		if (!section.thumbPath && !isVideoPath(filePath)) {
			await ensureImageThumb(sectionId, section, filePath);
		}
		console.log("warmed", filePath.join("/"));
	}

	console.log(
		`Warmup complete for section ${sectionId}${folder ? ` folder ${folder}` : ""} (${files.length} files)`,
	);
}

main()
	.catch((error) => {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	})
	.finally(async () => {
		await closeThumbKvClient();
		await closeRedisClient();
	});
