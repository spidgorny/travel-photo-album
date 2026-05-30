// @ts-nocheck
import "../lib/load-env.ts";
import fs from "fs/promises";
import process from "process";
import invariant from "tiny-invariant";
import { closeRedisClient } from "../lib/cache.ts";
import config from "../lib/config.ts";
import {
	closeThumbKvClient,
	isVideoPath,
} from "../lib/thumb-store.ts";
import {
	getStoredMetaDirectoryKey,
	normalizeStoredDescription,
	readStoredMetaDirectory,
} from "../lib/file-meta.ts";
import { joinSectionPath } from "../lib/files.ts";

async function main() {
	const { collectionInput } = parseArgs(process.argv.slice(2));
	const sectionIds = resolveSectionIds(collectionInput);
	const metaCache = new Map();
	let matched = 0;

	for (const sectionId of sectionIds) {
		const section = config.sections?.[sectionId];
		if (!section?.path) {
			console.warn(`skip [${sectionId}] ${section?.name ?? "unknown"} (missing section.path)`);
			continue;
		}
		console.log(`# [${sectionId}] ${section.name}`);
		const scanStats = { directories: 0, files: 0 };
		await scanCollectionFiles(section, [], scanStats, async (filePath) => {
			if (isVideoPath(filePath)) {
				return;
			}
			const description = await readDescriptionForFile(section, filePath, metaCache);
			if (!description) {
				return;
			}
			matched += 1;
			console.log(`${filePath.join("/")} :: ${description}`);
		});
		console.log(
			`section complete: scanned ${scanStats.files} files in ${scanStats.directories} directories`,
		);
	}

	console.log(`Found ${matched} file description${matched === 1 ? "" : "s"}.`);
}

function parseArgs(args: string[]) {
	const collectionInput = args.find((argument) => argument !== "--help" && argument !== "-h");
	return { collectionInput };
}

function resolveSectionIds(collectionInput: string | undefined) {
	if (!collectionInput) {
		return config.sections
			.map((section, index) => (section ? index : -1))
			.filter((index) => index >= 0);
	}
	if (/^\d+$/.test(collectionInput)) {
		const sectionId = Number(collectionInput);
		invariant(Number.isInteger(sectionId), "collection id must be an integer");
		invariant(config.sections?.[sectionId], "section not found");
		return [sectionId];
	}

	const normalizedInput = collectionInput.trim().toLowerCase();
	const sectionId = config.sections.findIndex(
		(section) => section?.name?.trim().toLowerCase() === normalizedInput,
	);
	invariant(sectionId >= 0, `section not found: ${collectionInput}`);
	return [sectionId];
}

async function readDescriptionForFile(section, filePath, metaCache) {
	const metaKey = getStoredMetaDirectoryKey(section, filePath);
	const metaData =
		metaCache.get(metaKey) ?? (await readStoredMetaDirectory(section, filePath));
	metaCache.set(metaKey, metaData);
	const baseName = filePath[filePath.length - 1];
	return normalizeStoredDescription(metaData?.[baseName]?.description);
}

async function scanCollectionFiles(section, rootSegments, scanStats, onFile) {
	invariant(section.path, "section.path");
	const entries = await readDirectoryEntries(section, rootSegments);
	const boundedEntries = applySectionBounds(entries, section, rootSegments);
	const displayPath = rootSegments.length > 0 ? rootSegments.join("/") : ".";
	scanStats.directories += 1;
	console.log(`scan [dir ${scanStats.directories}] ${displayPath} (${boundedEntries.length} entries)`);

	for (const entry of boundedEntries) {
		const nextPath = [...rootSegments, entry.name];
		if (entry.isDirectory()) {
			await scanCollectionFiles(section, nextPath, scanStats, onFile);
			continue;
		}
		if (entry.isFile()) {
			scanStats.files += 1;
			if (scanStats.files % 250 === 0) {
				console.log(`scan progress: discovered ${scanStats.files} files so far`);
			}
			await onFile(nextPath);
		}
	}
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
		await Promise.allSettled([closeThumbKvClient(), closeRedisClient()]);
	});
