// @ts-nocheck
/**
 * Migrates Kvrocks thumbnail keys from the old format (numeric sectionId) to
 * the new format (section name string).
 *
 * Old hash input: { sectionId: 5, filePath: "...", variant: "..." }
 * New hash input: { sectionName: "volumes-photo-new", filePath: "...", variant: "..." }
 *
 * Usage:
 *   node scripts/migrate-thumb-keys.ts [--section <name-or-index>] [--dry-run] [--delete-old]
 *
 * Options:
 *   --section   Migrate only this section (name). Default: all sections.
 *   --dry-run   Print what would be migrated without writing anything.
 *   --delete-old  Delete old keys after copying (default: keep old keys).
 */

import "../lib/system/load-env.ts";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import mime from "mime-types";
import process from "process";
import invariant from "tiny-invariant";
import config, { resolveSection } from "../lib/config/config.ts";
import { getSectionById, getSectionIndex } from "../lib/api/api-route.ts";
import {
	getThumbKvClient,
	thumbKvPrefix,
	thumbnailTargetWidth,
	videoThumbnailFrameCount,
} from "../lib/media/thumb-store.ts";
import { getFilteredFiles } from "../lib/media/files.ts";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const deleteOld = args.includes("--delete-old");
const sectionArg = args[args.indexOf("--section") + 1];

const defaultVariant = `w${thumbnailTargetWidth}-jpeg`;
const fullscreenVariant = "w1600-jpeg";

// Build variants to check for each file
function getVariantsForFile(filePath: string[]): string[] {
	const last = filePath[filePath.length - 1]?.toLowerCase() ?? "";
	const isVideo = [".mp4", ".mov", ".avi", ".mkv", ".webm"].some((ext) =>
		last.endsWith(ext),
	);
	if (isVideo) {
		return Array.from(
			{ length: videoThumbnailFrameCount },
			(_, i) => `${defaultVariant}:frame-${i}`,
		);
	}
	return [defaultVariant, fullscreenVariant];
}

// Old key hash: { sectionId: number, filePath, variant }
function oldThumbHash(sectionId: number, filePath: string[], variant: string): string {
	return crypto
		.createHash("sha1")
		.update(JSON.stringify({ sectionId, filePath: filePath.join("/"), variant }))
		.digest("hex");
}

// New key hash: { sectionName: string, filePath, variant }
function newThumbHash(sectionName: string, filePath: string[], variant: string): string {
	return crypto
		.createHash("sha1")
		.update(JSON.stringify({ sectionName, filePath: filePath.join("/"), variant }))
		.digest("hex");
}

function buildKeys(hash: string) {
	return {
		blobKey: `${thumbKvPrefix}:blob:${hash}`,
		metaKey: `${thumbKvPrefix}:meta:${hash}`,
	};
}

function resolveSectionInput(input: string | undefined) {
	if (!input) {
		return config.sections;
	}
	const section = getSectionById(config.sections, input);
	invariant(section, `section "${input}" not found`);
	return [section];
}

async function walkFiles(sectionPath: string, relPath: string[] = []): Promise<string[][]> {
	const fullPath = path.join(sectionPath, ...relPath);
	let entries: import("fs").Dirent[];
	try {
		entries = await fs.readdir(fullPath, { withFileTypes: true });
	} catch {
		return [];
	}

	const results: string[][] = [];
	for (const entry of entries) {
		const childRel = [...relPath, entry.name];
		if (entry.isDirectory()) {
			const children = await walkFiles(sectionPath, childRel);
			results.push(...children);
		} else if (entry.isFile()) {
			const ext = path.extname(entry.name).toLowerCase();
			const mimeType = mime.lookup(entry.name);
			if (mimeType && (mimeType.startsWith("image/") || mimeType.startsWith("video/"))) {
				results.push(childRel);
			}
		}
	}
	return results;
}

async function main() {
	const client = await getThumbKvClient();
	if (!client) {
		console.error("Kvrocks/Redis client not available. Set THUMB_KV_URL in .env");
		process.exit(1);
	}

	const sections = resolveSectionInput(sectionArg);
	let totalCopied = 0;
	let totalSkipped = 0;
	let totalMissing = 0;
	let totalDeleted = 0;

	for (const section of sections) {
		const sectionIndex = getSectionIndex(config.sections, section);
		if (!section.path) {
			console.log(`[${section.name}]: no resolved path, skipping`);
			continue;
		}
		if (section.thumbPath) {
			console.log(
				`[${section.name}]: uses disk thumbPath, Kvrocks keys not applicable, skipping`,
			);
			continue;
		}

		console.log(`\n[${section.name}] → ${section.path}`);

		const files = await walkFiles(section.path);
		console.log(`  Found ${files.length} media files`);

		let copied = 0;
		let skipped = 0;
		let missing = 0;

		for (const filePath of files) {
			const variants = getVariantsForFile(filePath);
			for (const variant of variants) {
				const oldHash = oldThumbHash(sectionIndex, filePath, variant);
				const newHash = newThumbHash(section.name, filePath, variant);
				const { blobKey: oldBlobKey, metaKey: oldMetaKey } = buildKeys(oldHash);
				const { blobKey: newBlobKey, metaKey: newMetaKey } = buildKeys(newHash);

				// Skip if new key already exists (already migrated)
				const newBlobExists = await client.exists(newBlobKey);
				if (newBlobExists) {
					skipped++;
					continue;
				}

				// Check if old blob key exists
				const [blob, meta] = await Promise.all([
					client.get(oldBlobKey),
					client.hGetAll(oldMetaKey),
				]);

				if (!blob) {
					missing++;
					continue;
				}

				if (!dryRun) {
					await client.set(newBlobKey, blob);
					if (meta && Object.keys(meta).length > 0) {
						await client.hSet(newMetaKey, meta);
					}
					if (deleteOld) {
						await client.del(oldBlobKey);
						await client.del(oldMetaKey);
					}
				}
				copied++;
			}
		}

		console.log(
			`  ${dryRun ? "[DRY RUN] Would copy" : "Copied"}: ${copied}, already migrated: ${skipped}, no old key: ${missing}`,
		);
		totalCopied += copied;
		totalSkipped += skipped;
		totalMissing += missing;
	}

	console.log(`\nDone.`);
	console.log(`  ${dryRun ? "Would copy" : "Copied"}: ${totalCopied}`);
	console.log(`  Already migrated (skipped): ${totalSkipped}`);
	console.log(`  No cached thumb (no old key): ${totalMissing}`);
	if (deleteOld && !dryRun) {
		console.log(`  Old keys deleted: ${totalDeleted}`);
	}

	await client.quit().catch(() => {});
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
