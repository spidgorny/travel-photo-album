import "../lib/load-env.ts";
import config from "../lib/config.ts";
import {
	closeSearchIndex,
	countSearchEntries,
	getSearchIndexPath,
	rebuildSearchIndex,
	type RebuildSearchIndexProgress,
	type SearchSection,
} from "../lib/search-index.ts";
import { closeThumbKvClient } from "../lib/thumb-store.ts";
import { closeRedisClient } from "../lib/cache.ts";

const sections = (Array.isArray(config.sections) ? config.sections : []).map((section, index) => ({
	...section,
	id: index,
})) as SearchSection[];
const requestedSections = getRequestedSections(sections, process.argv.slice(2));
const startedAt = Date.now();
let lastProgressLogAt = 0;

console.log(
	`Indexing search metadata into ${getSearchIndexPath()} for ${requestedSections.length} collection(s)`,
);

const totalEntries = await rebuildSearchIndex(requestedSections, {
	replaceAll: requestedSections.length === sections.length,
	onProgress: logIndexProgress,
});
const indexedEntryCount = await countSearchEntries();

const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
console.log(
	`Indexed ${indexedEntryCount} file row(s) in ${elapsedSeconds}s (${totalEntries} total entries in Typesense)`,
);

await Promise.allSettled([closeThumbKvClient(), closeRedisClient()]);
closeSearchIndex();

function getRequestedSections(allSections: SearchSection[], args: string[]) {
	const requestedValues: string[] = [];

	for (let index = 0; index < args.length; index += 1) {
		const argument = args[index];
		if (argument === "--section" && args[index + 1]) {
			requestedValues.push(args[index + 1]);
			index += 1;
			continue;
		}
		if (argument.startsWith("--section=")) {
			requestedValues.push(argument.slice("--section=".length));
		}
	}

	if (!requestedValues.length) {
		return allSections;
	}

	const normalizedValues = requestedValues.map((value) => value.trim().toLocaleLowerCase());
	const matches = allSections.filter((section) => {
		const sectionId = String(section.id);
		const sectionName = section.name.trim().toLocaleLowerCase();
		return normalizedValues.some(
			(value) => value === sectionId || value === sectionName,
		);
	});

	if (!matches.length) {
		throw new Error(`No collections matched --section ${requestedValues.join(", ")}`);
	}

	return matches;
}

function logIndexProgress(event: RebuildSearchIndexProgress) {
	const now = Date.now();
	const isThrottledPhase = event.phase === "section-scan" || event.phase === "section-import";
	if (isThrottledPhase && now - lastProgressLogAt < 1000) {
		return;
	}

	if (isThrottledPhase) {
		lastProgressLogAt = now;
	}

	switch (event.phase) {
 		case "prepare":
 			console.log(
 				event.replaceAll
 					? "Resetting Typesense collections before rebuild..."
 					: "Updating requested collections in existing Typesense index...",
 			);
 			break;
		case "section-start":
			console.log(
				`[${event.sectionId}] ${event.sectionName}: collecting stored metadata for indexing...`,
			);
			break;
		case "section-scan":
			console.log(
				`[${event.sectionId}] ${event.sectionName}: scanned ${
					event.source === "thumb-meta"
						? `${event.metaFilesScanned ?? 0} meta.json file(s)`
						: `${event.filesScanned ?? 0} stored file record(s)`
				}, collected ${event.entriesCollected ?? 0} entries / ${event.groupsCollected ?? 0} groups`,
			);
			break;
		case "section-import":
			console.log(
				`[${event.sectionId}] ${event.sectionName}: imported ${event.documentsImported ?? 0}/${event.totalDocuments ?? 0} ${
					event.source === "thumb-meta" ? "group" : "entry"
				} document(s) (batch ${event.batchNumber ?? 0}/${event.batchCount ?? 0})`,
			);
			break;
		case "section-complete":
			console.log(
				`[${event.sectionId}] ${event.sectionName}: complete with ${event.entriesCollected ?? 0} entries and ${event.groupsCollected ?? 0} groups`,
			);
			break;
		default:
			break;
	}
}
