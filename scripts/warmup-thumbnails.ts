// @ts-nocheck
import fs from "fs/promises";
import mime from "mime-types";
import process from "process";
import invariant from "tiny-invariant";
import config from "../lib/config.ts";
import { closeRedisClient } from "../lib/cache.ts";
import { joinSectionPath } from "../lib/files.ts";
import {
	closeThumbKvClient,
	ensureSectionThumb,
	isVideoPath,
} from "../lib/thumb-store.ts";

async function main() {
	const [collectionInput] = process.argv.slice(2);
	if (!collectionInput || collectionInput === "--help" || collectionInput === "-h") {
		console.log('Usage: npm run warmup:thumbs -- <collection-id-or-name>');
		return;
	}
	const sectionId = resolveCollectionId(collectionInput);
	const section = config.sections?.[sectionId];
	invariant(section, "section not found");
	const files = await scanCollectionFiles(section, []);
	let warmed = 0;
	let skipped = 0;
	let failed = 0;

	console.log(
		`Scanning collection ${sectionId}: ${section.name} (${files.length} candidate files)`,
	);

	for (const filePath of files) {
		const fullPath = joinSectionPath(section.path, filePath);
		const mimeType = mime.lookup(fullPath) || "";
		const isMedia = mimeType.startsWith("image/") || isVideoPath(filePath);
		if (!isMedia) {
			skipped += 1;
			console.warn("skipped", filePath.join("/"), mimeType || "unknown");
			continue;
		}

		try {
			await ensureSectionThumb(sectionId, section, filePath);
			warmed += 1;
			console.log("warmed", filePath.join("/"));
		} catch (error) {
			failed += 1;
			const message = error instanceof Error ? error.message : String(error);
			console.error("failed", filePath.join("/"), message);
		}
	}

	console.log(
		`Warmup complete for collection ${sectionId}: ${section.name} (${warmed} warmed, ${skipped} skipped, ${failed} failed)`,
	);
	if (failed > 0) {
		process.exitCode = 1;
	}
}

function resolveCollectionId(collectionInput: string) {
	if (/^\d+$/.test(collectionInput)) {
		const sectionId = Number(collectionInput);
		invariant(Number.isInteger(sectionId), "collection id must be an integer");
		invariant(config.sections?.[sectionId], "section not found");
		return sectionId;
	}

	const normalizedInput = collectionInput.trim().toLowerCase();
	const sectionId = config.sections.findIndex(
		(section) => section?.name?.trim().toLowerCase() === normalizedInput,
	);
	invariant(sectionId >= 0, `section not found: ${collectionInput}`);
	return sectionId;
}

async function scanCollectionFiles(section, rootSegments) {
	invariant(section.path, "section.path");
	const entries = await readDirectoryEntries(section, rootSegments);
	const boundedEntries = applySectionBounds(entries, section, rootSegments);
	const files = [];

	for (const entry of boundedEntries) {
		const nextPath = [...rootSegments, entry.name];
		if (entry.isDirectory()) {
			files.push(...(await scanCollectionFiles(section, nextPath)));
			continue;
		}
		if (entry.isFile()) {
			files.push(nextPath);
		}
	}

	return files;
}

async function readDirectoryEntries(section, pathSegments) {
	const directoryPath = joinSectionPath(section.path, pathSegments);
	const entries = await fs.readdir(directoryPath, { withFileTypes: true });
	return entries.sort((firstEntry, secondEntry) =>
		firstEntry.name.localeCompare(secondEntry.name, undefined, {
			numeric: true,
			sensitivity: "base",
		}),
	);
}

function applySectionBounds(entries, section, pathSegments) {
	if (pathSegments.length > 0) {
		return entries;
	}

	let boundedEntries = entries;
	if (section.from) {
		const startIndex = boundedEntries.findIndex((entry) => entry.name === section.from);
		if (startIndex >= 0) {
			boundedEntries = boundedEntries.slice(startIndex);
		}
	}
	if (section.till) {
		const endIndex = boundedEntries.findIndex((entry) => entry.name === section.till);
		if (endIndex >= 0) {
			boundedEntries = boundedEntries.slice(0, endIndex + 1);
		}
	}
	return boundedEntries;
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
