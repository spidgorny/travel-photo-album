// @ts-nocheck
import "../lib/load-env.ts";
import fs from "fs/promises";
import mime from "mime-types";
import process from "process";
import invariant from "tiny-invariant";
import config from "../lib/config.ts";
import { closeRedisClient } from "../lib/cache.ts";
import {
	closeDescriptionQueue,
	DescriptionQueue,
	validateDescriptionQueueConnection,
} from "../lib/description-queue.ts";
import {
	descriptionJobActions,
	isDescriptionQueueConfigured,
} from "../lib/description-jobs.ts";
import { isHiddenPathSegment, joinSectionPath } from "../lib/files.ts";
import { storeFolderListing } from "../lib/folder-store.ts";
import { getSectionById, getSectionIndex } from "../lib/api-route.ts";
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
	hasExifOrientationTransform,
	normalizeStoredDescription,
	readStoredMetaForFile,
} from "../lib/file-meta.ts";
import {
	closeThumbKvClient,
	hasStoredSectionThumb,
	isVideoPath,
	thumbnailTargetWidth,
} from "../lib/thumb-store.ts";

const ANSI_RED = "\u001b[31m";
const ANSI_RESET = "\u001b[0m";

// Output helpers — use inline (overwrite) for file-level noise, newlines for folders/errors.
const isTTY = process.stdout.isTTY;
let lastLineWasInline = false;

function printLine(message: string) {
	if (lastLineWasInline) {
		process.stdout.write("\n");
		lastLineWasInline = false;
	}
	console.log(message);
}

function printError(message: string) {
	if (lastLineWasInline) {
		process.stderr.write("\n");
		lastLineWasInline = false;
	}
	console.error(message);
}

function printInline(message: string) {
	if (!isTTY) {
		console.log(message);
		return;
	}
	const maxWidth = (process.stdout.columns || 120) - 1;
	const truncated = message.length > maxWidth ? `${message.slice(0, maxWidth - 1)}…` : message;
	process.stdout.write(`\r${truncated.padEnd(maxWidth)}`);
	lastLineWasInline = true;
}

async function main() {
	const startedAt = Date.now();
	const { collectionInput, force, forceRotated } = parseArgs(process.argv.slice(2));
	if (!collectionInput) {
		console.log(
			"Usage: npm run warmup:thumbs -- <collection-name> [--force] [--force-rotated]",
		);
		return;
	}
	const section = getSectionById(config.sections, collectionInput);
	invariant(section, `section not found: ${collectionInput}`);
	const sectionId = getSectionIndex(config.sections, section);
	console.log(`Resolved collection: ${section.name}`);
	console.log(`Root path: ${section.path}`);
	if (section.thumbPath) {
		console.log(`Thumbnail path: ${section.thumbPath}`);
	} else {
		console.log("Thumbnail path: generated from source files / KV store");
	}
	console.log("Validating BullMQ connection...");
	await validateThumbQueueConnection();
	if (isDescriptionQueueConfigured()) {
		await validateDescriptionQueueConnection();
	}
	console.log("BullMQ connection OK.");
	console.log("Scanning folders recursively...");
	const scanStats = { directories: 0, files: 0 };
	let enqueued = 0;
	let skipped = 0;
	let failed = 0;
	const variant = `w${thumbnailTargetWidth}-jpeg`;
	const queue = new ThumbQueue();
	const descriptionQueue = new DescriptionQueue();
	await scanCollectionFiles(section, [], scanStats, async (filePath, index) => {
		const progressLabel = `[${index}]`;
		const fullPath = joinSectionPath(section.path, filePath);
		const mimeType = mime.lookup(fullPath) || "";
		const isMedia = mimeType.startsWith("image/") || isVideoPath(filePath);
		if (!isMedia) {
			skipped += 1;
			printLine(`skipped ${progressLabel} ${filePath.join("/")} (${mimeType || "unknown"})`);
			return;
		}

		try {
			const indexState = await getIndexState(
				sectionId,
				section,
				filePath,
				variant,
				force,
				forceRotated,
			);
			if (!indexState.shouldEnqueue) {
				skipped += 1;
				printInline(`skip ${progressLabel} ${filePath.join("/")} (already indexed)`);
				return;
			}
			const queuePayload =
				indexState.reason === "missing-description"
					? {
							action: descriptionJobActions.generateImageDescription,
							sectionId,
							section: serializeSectionForWorker(section),
							filePath,
							variant,
							force: indexState.force,
						}
					: {
							action: thumbJobActions.warmSectionFile,
							sectionId,
							section: serializeSectionForWorker(section),
							filePath,
							variant,
							force: indexState.force,
						};
			const job =
				indexState.reason === "missing-description"
					? await descriptionQueue.enqueue(queuePayload)
					: await queue.enqueue(queuePayload);
			if (!job) {
				throw new Error(
					indexState.reason === "missing-description"
						? "description queue is not configured"
						: "thumb queue is not configured",
				);
			}
			enqueued += 1;
			printInline(
				`queued ${progressLabel} ${filePath.join("/")} (${job.name}: ${indexState.reason})`,
			);
		} catch (error) {
			failed += 1;
			const message = error instanceof Error ? error.message : String(error);
			printError(`failed ${progressLabel} ${filePath.join("/")} ${message}`);
		}
	});

	printLine(
		`Scan complete: ${scanStats.directories} director${scanStats.directories === 1 ? "y" : "ies"}, ${scanStats.files} candidate files`,
	);

	const summary = `Warmup complete for collection: ${section.name} (${enqueued} enqueued, ${skipped} skipped, ${failed} failed) in ${formatDuration(Date.now() - startedAt)}`;
	if (failed > 0) {
		printError(`${ANSI_RED}${summary}${ANSI_RESET}`);
		process.exitCode = 1;
	} else {
		printLine(summary);
	}
}

function parseArgs(args: string[]) {
	const force = args.includes("--force");
	const forceRotated = args.includes("--force-rotated");
	const collectionInput = args.find(
		(argument) =>
			argument !== "--force" &&
			argument !== "--force-rotated" &&
			argument !== "--help" &&
			argument !== "-h",
	);
	return { collectionInput, force, forceRotated };
}

async function getIndexState(
	sectionId: number,
	section,
	filePath: string[],
	variant: string,
	force: boolean,
	forceRotated: boolean,
) {
	if (force) {
		return { shouldEnqueue: true, reason: "force", force: true };
	}

	if (forceRotated && !isVideoPath(filePath)) {
		const shouldReindexRotated = await hasExifOrientationTransform(section, filePath);
		if (shouldReindexRotated) {
			return { shouldEnqueue: true, reason: "force-rotated", force: true };
		}
	}

	const [hasThumb, storedMeta] = await Promise.all([
		hasStoredSectionThumb(section, filePath, variant),
		readStoredMetaForFile(section, filePath),
	]);
	const hasDescription = Boolean(normalizeStoredDescription(storedMeta?.description));
	const needsDescription =
		!isVideoPath(filePath) && isDescriptionQueueConfigured() && !hasDescription;

	if (hasThumb && storedMeta && !needsDescription) {
		return { shouldEnqueue: false, reason: "already-indexed", force: false };
	}

	if (!hasThumb && !storedMeta) {
		return { shouldEnqueue: true, reason: "missing-thumb-and-metadata", force: false };
	}

	if (needsDescription) {
		return { shouldEnqueue: true, reason: "missing-description", force: false };
	}

	return {
		shouldEnqueue: true,
		reason: hasThumb ? "missing-metadata" : "missing-thumbnail",
		force: false,
	};
}

async function scanCollectionFiles(section, rootSegments, scanStats, onFile) {
	invariant(section.path, "section.path");
	const displayPath = rootSegments.length > 0 ? rootSegments.join("/") : ".";
	printInline(`reading ${displayPath}...`);
	const entries = await readDirectoryEntries(section, rootSegments);
	const boundedEntries = applySectionBounds(entries, section, rootSegments);
	scanStats.directories += 1;
	printLine(
		`scan [dir ${scanStats.directories}] ${displayPath} (${boundedEntries.length} entries)`,
	);

	await storeFolderListing(section, rootSegments, boundedEntries);

	for (const entry of boundedEntries) {
		const nextPath = [...rootSegments, entry.name];
		if (entry.isDirectory()) {
			await scanCollectionFiles(section, nextPath, scanStats, onFile);
			continue;
		}
		if (entry.isFile()) {
			scanStats.files += 1;
			await onFile(nextPath, scanStats.files);
		}
	}
}

async function readDirectoryEntries(section, pathSegments) {
	const directoryPath = joinSectionPath(section.path, pathSegments);
	const entries = await fs.readdir(directoryPath, { withFileTypes: true });
	return entries
		.filter((entry) => !isHiddenPathSegment(entry.name))
		.sort((firstEntry, secondEntry) =>
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
		await closeDescriptionQueue();
		await closeThumbKvClient();
		await closeRedisClient();
	});
