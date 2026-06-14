// @ts-nocheck
import "../lib/system/load-env.ts";
import fs from "fs/promises";
import mime from "mime-types";
import process from "process";
import invariant from "tiny-invariant";
import config from "../lib/config/config.ts";
import {
	buildPerceptualHashFromBuffer,
	normalizeStoredPhash,
	readStoredMetaForFile,
	writeStoredMetaForFile,
} from "../lib/media/file-meta.ts";
import { isHiddenPathSegment, joinSectionPath } from "../lib/media/files.ts";
import { getSectionById } from "../lib/api/api-route.ts";
import {
	closeThumbKvClient,
	isVideoPath,
	readStoredSectionThumb,
	thumbnailTargetWidth,
} from "../lib/media/thumb-store.ts";

async function main() {
	const startedAt = Date.now();
	const { collectionInput, force } = parseArgs(process.argv.slice(2));
	if (!collectionInput) {
		console.log("Usage: npm run index:phash -- <collection-name> [--force]");
		return;
	}

	const section = getSectionById(config.sections, collectionInput);
	invariant(section, `section not found: ${collectionInput}`);

	console.log(`Resolved collection: ${section.name}`);
	console.log(`Root path: ${section.path}`);
	if (section.thumbPath) {
		console.log(`Thumbnail path: ${section.thumbPath}`);
	} else {
		console.log("Thumbnail path: Kvrocks");
	}

	const scanStats = { directories: 0, files: 0 };
	const counters = {
		mediaFiles: 0,
		filesWithExistingPhash: 0,
		filesMissingPhash: 0,
		filesWithoutStoredMeta: 0,
		filesWithoutThumb: 0,
		filesWithUnreadableThumb: 0,
		filesUpdated: 0,
		skippedUnchanged: 0,
		failed: 0,
	};
	const variant = `w${thumbnailTargetWidth}-jpeg`;

	await scanCollectionFiles(section, [], scanStats, async (filePath, index) => {
		const progressLabel = `[${index}]`;
		const fullPath = joinSectionPath(section.path, filePath);
		const mimeType = mime.lookup(fullPath) || "";
		const isMedia = mimeType.startsWith("image/") || isVideoPath(filePath);
		if (!isMedia) {
			return;
		}

		counters.mediaFiles += 1;

		try {
			const existingMeta = await readStoredMetaForFile(section, filePath);
			const existingPhash = normalizeStoredPhash(existingMeta?.phash);
			if (!existingMeta) {
				counters.filesWithoutStoredMeta += 1;
			}
			if (existingPhash && !force) {
				counters.filesWithExistingPhash += 1;
				console.log(`skip ${progressLabel} ${filePath.join("/")} (already has phash ${existingPhash})`);
				return;
			}

			counters.filesMissingPhash += 1;
			const thumb = await readStoredSectionThumb(section, filePath, variant);
			if (!thumb?.buffer?.length) {
				counters.filesWithoutThumb += 1;
				console.log(`skip ${progressLabel} ${filePath.join("/")} (no stored thumbnail)`);
				return;
			}

			const phash = await buildPerceptualHashFromBuffer(thumb.buffer);
			if (!phash) {
				counters.filesWithUnreadableThumb += 1;
				console.log(
					`skip ${progressLabel} ${filePath.join("/")} (failed to read ${thumb.source} thumbnail)`,
				);
				return;
			}

			if (existingPhash === phash) {
				counters.skippedUnchanged += 1;
				console.log(`skip ${progressLabel} ${filePath.join("/")} (${thumb.source} phash unchanged)`);
				return;
			}

			const nextMeta = {
				...(existingMeta ?? { COMPUTED: {} }),
				COMPUTED: existingMeta?.COMPUTED ?? {},
				phash,
			};
			await writeStoredMetaForFile(section, filePath, nextMeta);
			counters.filesUpdated += 1;
			console.log(`update ${progressLabel} ${filePath.join("/")} (${thumb.source}) -> ${phash}`);
		} catch (error) {
			counters.failed += 1;
			const message = error instanceof Error ? error.message : String(error);
			console.error(`failed ${progressLabel} ${filePath.join("/")} ${message}`);
		}
	});

	console.log("pHash indexing complete:");
	console.log(`  directories scanned: ${scanStats.directories}`);
	console.log(`  files scanned: ${scanStats.files}`);
	console.log(`  media files scanned: ${counters.mediaFiles}`);
	console.log(`  files already containing phash: ${counters.filesWithExistingPhash}`);
	console.log(`  files missing phash: ${counters.filesMissingPhash}`);
	console.log(`  files without stored metadata: ${counters.filesWithoutStoredMeta}`);
	console.log(`  files without stored thumbnail: ${counters.filesWithoutThumb}`);
	console.log(`  files with unreadable thumbnail: ${counters.filesWithUnreadableThumb}`);
	console.log(`  files updated: ${counters.filesUpdated}`);
	console.log(`  skipped (unchanged): ${counters.skippedUnchanged}`);
	console.log(`  failed: ${counters.failed}`);
	console.log(`  duration: ${formatDuration(Date.now() - startedAt)}`);
}

function parseArgs(args: string[]) {
	const force = args.includes("--force");
	const collectionInput = args.find(
		(argument) => argument !== "--force" && argument !== "--help" && argument !== "-h",
	);
	return { collectionInput, force };
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
		await closeThumbKvClient();
	});
