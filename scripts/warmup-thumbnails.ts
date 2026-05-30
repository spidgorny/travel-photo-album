// @ts-nocheck
import "../lib/load-env.ts";
import fs from "fs/promises";
import mime from "mime-types";
import process from "process";
import invariant from "tiny-invariant";
import config from "../lib/config.ts";
import { closeRedisClient } from "../lib/cache.ts";
import { joinSectionPath } from "../lib/files.ts";
import {
	serializeSectionForWorker,
	thumbJobActions,
} from "../lib/thumb-jobs.ts";
import {
	closeThumbQueue,
	ThumbQueue,
	validateThumbQueueConnection,
} from "../lib/thumb-queue.ts";
import {
	closeThumbKvClient,
	isVideoPath,
} from "../lib/thumb-store.ts";

const ANSI_RED = "\u001b[31m";
const ANSI_RESET = "\u001b[0m";

async function main() {
	const startedAt = Date.now();
	const [collectionInput] = process.argv.slice(2);
	if (!collectionInput || collectionInput === "--help" || collectionInput === "-h") {
		console.log('Usage: npm run warmup:thumbs -- <collection-id-or-name>');
		return;
	}
	const sectionId = resolveCollectionId(collectionInput);
	const section = config.sections?.[sectionId];
	invariant(section, "section not found");
	console.log(`Resolved collection ${sectionId}: ${section.name}`);
	console.log(`Root path: ${section.path}`);
	if (section.thumbPath) {
		console.log(`Thumbnail path: ${section.thumbPath}`);
	} else {
		console.log("Thumbnail path: generated from source files / KV store");
	}
	console.log("Validating BullMQ connection...");
	await validateThumbQueueConnection();
	console.log("BullMQ connection OK.");
	console.log("Scanning folders recursively...");
	const scanStats = { directories: 0, files: 0 };
	let enqueued = 0;
	let skipped = 0;
	let failed = 0;
	const queue = new ThumbQueue();
	await scanCollectionFiles(section, [], scanStats, async (filePath, index) => {
		const progressLabel = `[${index}]`;
		const fullPath = joinSectionPath(section.path, filePath);
		const mimeType = mime.lookup(fullPath) || "";
		const isMedia = mimeType.startsWith("image/") || isVideoPath(filePath);
		if (!isMedia) {
			skipped += 1;
			console.warn(
				`skipped ${progressLabel} ${filePath.join("/")} (${mimeType || "unknown"})`,
			);
			return;
		}

		try {
			const job = await queue.enqueue({
				action: thumbJobActions.warmSectionFile,
				sectionId,
				section: serializeSectionForWorker(section),
				filePath,
			});
			if (!job) {
				throw new Error("thumb queue is not configured");
			}
			enqueued += 1;
			console.log(`queued ${progressLabel} ${filePath.join("/")} (${job.name})`);
		} catch (error) {
			failed += 1;
			const message = error instanceof Error ? error.message : String(error);
			console.error(`failed ${progressLabel} ${filePath.join("/")} ${message}`);
		}
	});

	console.log(
		`Scan complete: ${scanStats.directories} director${scanStats.directories === 1 ? "y" : "ies"}, ${scanStats.files} candidate files`,
	);

	const summary = `Warmup complete for collection ${sectionId}: ${section.name} (${enqueued} enqueued, ${skipped} skipped, ${failed} failed) in ${formatDuration(Date.now() - startedAt)}`;
	if (failed > 0) {
		console.error(`${ANSI_RED}${summary}${ANSI_RESET}`);
		process.exitCode = 1;
	} else {
		console.log(summary);
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

async function scanCollectionFiles(section, rootSegments, scanStats, onFile) {
	invariant(section.path, "section.path");
	const entries = await readDirectoryEntries(section, rootSegments);
	const boundedEntries = applySectionBounds(entries, section, rootSegments);
	const displayPath = rootSegments.length > 0 ? rootSegments.join("/") : ".";
	scanStats.directories += 1;
	console.log(
		`scan [dir ${scanStats.directories}] ${displayPath} (${boundedEntries.length} entries)`,
	);

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
			await onFile(nextPath, scanStats.files);
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

function formatDuration(durationMs) {
	const totalSeconds = Math.round(durationMs / 1000);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${minutes}m ${seconds}s`;
}

main()
	.catch((error) => {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	})
	.finally(async () => {
		await closeThumbQueue();
		await closeThumbKvClient();
		await closeRedisClient();
	});
