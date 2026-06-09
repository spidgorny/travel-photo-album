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
const SCAN_CONCURRENCY = 20;
const BATCH_SIZE = 250;

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

	// Phase 1: walk the directory tree, store folder listings in Kvrocks
	const allFiles = await collectFiles(section, [], scanStats);
	printLine(
		`Discovered ${allFiles.length} files in ${scanStats.directories} director${scanStats.directories === 1 ? "y" : "ies"}`,
	);

	// Phase 2: check each file concurrently (SCAN_CONCURRENCY parallel Kvrocks lookups)
	type PendingJob = { type: "thumb" | "description"; payload: object; reason: string };
	const pendingJobs = await processPool<string[], PendingJob | null>(
		allFiles,
		SCAN_CONCURRENCY,
		async (filePath, i) => {
			const progressLabel = `[${i + 1}/${allFiles.length}]`;
			const fullPath = joinSectionPath(section.path, filePath);
			const mimeType = mime.lookup(fullPath) || "";
			const isMedia = mimeType.startsWith("image/") || isVideoPath(filePath);
			if (!isMedia) {
				skipped += 1;
				printLine(`skipped ${progressLabel} ${filePath.join("/")} (${mimeType || "unknown"})`);
				return null;
			}
			try {
				const indexState = await getIndexState(sectionId, section, filePath, variant, force, forceRotated);
				if (!indexState.shouldEnqueue) {
					skipped += 1;
					printInline(`skip ${progressLabel} ${filePath.join("/")} (already indexed)`);
					return null;
				}
				const type = indexState.reason === "missing-description" ? "description" : "thumb";
				const payload =
					type === "description"
						? { action: descriptionJobActions.generateImageDescription, sectionId, section: serializeSectionForWorker(section), filePath, variant, force: indexState.force }
						: { action: thumbJobActions.warmSectionFile, sectionId, section: serializeSectionForWorker(section), filePath, variant, force: indexState.force };
				printInline(`pending ${progressLabel} ${filePath.join("/")} (${indexState.reason})`);
				return { type, payload, reason: indexState.reason };
			} catch (error) {
				failed += 1;
				const message = error instanceof Error ? error.message : String(error);
				printError(`failed ${progressLabel} ${filePath.join("/")} ${message}`);
				return null;
			}
		},
	);

	// Phase 3: batch-enqueue all collected jobs
	const thumbJobs = pendingJobs.filter((j): j is PendingJob => j?.type === "thumb");
	const descJobs = pendingJobs.filter((j): j is PendingJob => j?.type === "description");
	const totalToEnqueue = thumbJobs.length + descJobs.length;
	printLine(`Enqueueing ${totalToEnqueue} jobs (${thumbJobs.length} thumb, ${descJobs.length} description)...`);

	for (let i = 0; i < thumbJobs.length; i += BATCH_SIZE) {
		const batch = thumbJobs.slice(i, i + BATCH_SIZE);
		const jobs = await queue.enqueueBulk(batch.map((j) => j.payload as never));
		if (!jobs.length && batch.length) {
			printError(`${ANSI_RED}thumb queue not configured — no jobs added${ANSI_RESET}`);
			failed += batch.length;
			break;
		}
		enqueued += batch.length;
		printLine(`enqueued ${enqueued}/${totalToEnqueue} thumb jobs`);
	}

	for (let i = 0; i < descJobs.length; i += BATCH_SIZE) {
		const batch = descJobs.slice(i, i + BATCH_SIZE);
		const jobs = await descriptionQueue.enqueueBulk(batch.map((j) => j.payload as never));
		if (!jobs.length && batch.length) {
			printError(`${ANSI_RED}description queue not configured — no jobs added${ANSI_RESET}`);
			failed += batch.length;
			break;
		}
		enqueued += batch.length;
		printLine(`enqueued ${enqueued}/${totalToEnqueue} total jobs`);
	}

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

// Runs fn on each item with at most `concurrency` in-flight at once.
async function processPool<T, R>(
	items: T[],
	concurrency: number,
	fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
	const results: R[] = new Array(items.length);
	let next = 0;
	async function worker() {
		while (next < items.length) {
			const i = next++;
			results[i] = await fn(items[i], i);
		}
	}
	await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
	return results;
}

// Phase 1: walk directory tree, store folder listings, return all file paths.
async function collectFiles(section, rootSegments, scanStats): Promise<string[][]> {
	const displayPath = rootSegments.length > 0 ? rootSegments.join("/") : ".";
	printInline(`reading ${displayPath}...`);
	const entries = await readDirectoryEntries(section, rootSegments);
	const boundedEntries = applySectionBounds(entries, section, rootSegments);
	scanStats.directories += 1;
	printLine(
		`scan [dir ${scanStats.directories}] ${displayPath} (${boundedEntries.length} entries)`,
	);

	await storeFolderListing(section, rootSegments, boundedEntries);

	const files: string[][] = [];
	for (const entry of boundedEntries) {
		const nextPath = [...rootSegments, entry.name];
		if (entry.isDirectory()) {
			const subFiles = await collectFiles(section, nextPath, scanStats);
			files.push(...subFiles);
		} else if (entry.isFile()) {
			scanStats.files += 1;
			files.push(nextPath);
		}
	}
	return files;
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
