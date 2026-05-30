import fs from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import config from "../../../lib/config";
import { jsonError } from "../../../lib/api-route";
import { getThumbQueue } from "../../../lib/thumb-queue";
import {
	getThumbKvClient,
	thumbKvPrefix,
	thumbKvUrl,
} from "../../../lib/thumb-store";
import {
	thumbQueueName,
	thumbQueuePrefix,
	thumbQueueUrl,
} from "../../../lib/thumb-jobs";

export const runtime = "nodejs";

export async function GET() {
	try {
		const [queue, storage] = await Promise.all([
			getQueueInfo(),
			getThumbStorageInfo(),
		]);

		return NextResponse.json({
			queue,
			storage,
			updatedAt: new Date().toISOString(),
		});
	} catch (error) {
		return NextResponse.json(jsonError(error), { status: 500 });
	}
}

async function getQueueInfo() {
	const queue = await getThumbQueue();
	if (!queue) {
		return {
			configured: false,
			connectionUrl: thumbQueueUrl || null,
			name: thumbQueueName,
			prefix: thumbQueuePrefix,
			counts: emptyQueueCounts(),
			totalQueued: 0,
			totalProcessed: 0,
		};
	}

	const counts = await queue.getJobCounts(
		"waiting",
		"active",
		"delayed",
		"completed",
		"failed",
		"paused",
	);

	return {
		configured: true,
		connectionUrl: thumbQueueUrl || null,
		name: thumbQueueName,
		prefix: thumbQueuePrefix,
		counts,
		totalQueued:
			(counts.waiting ?? 0) +
			(counts.active ?? 0) +
			(counts.delayed ?? 0) +
			(counts.paused ?? 0),
		totalProcessed: (counts.completed ?? 0) + (counts.failed ?? 0),
	};
}

function emptyQueueCounts() {
	return {
		waiting: 0,
		active: 0,
		delayed: 0,
		completed: 0,
		failed: 0,
		paused: 0,
	};
}

async function getThumbStorageInfo() {
	const sections = Array.isArray(config?.sections) ? config.sections : [];
	const thumbRoots = Array.from(
		new Set(
			sections
				.map((section) => section.thumbPath)
				.filter((thumbPath): thumbPath is string => typeof thumbPath === "string" && thumbPath.length > 0),
		),
	);

	const diskRoots = await Promise.all(thumbRoots.map((thumbRoot) => inspectThumbRoot(thumbRoot)));
	const kv = await inspectThumbKv();

	const disk = diskRoots.reduce(
		(summary, root) => {
			summary.configuredRoots += 1;
			if (!root.exists) {
				summary.missingRoots += 1;
			}
			summary.directories += root.directories;
			summary.thumbnailFiles += root.thumbnailFiles;
			summary.metaFiles += root.metaFiles;
			summary.totalBytes += root.totalBytes;
			return summary;
		},
		{
			configuredRoots: 0,
			missingRoots: 0,
			directories: 0,
			thumbnailFiles: 0,
			metaFiles: 0,
			totalBytes: 0,
		},
	);

	return {
		configuredSections: sections.length,
		diskBackedSections: sections.filter((section) => !!section.thumbPath).length,
		kvBackedSections: sections.filter((section) => !section.thumbPath).length,
		disk,
		diskRoots,
		kv,
	};
}

async function inspectThumbRoot(rootPath: string) {
	const stats = {
		path: rootPath,
		exists: false,
		directories: 0,
		thumbnailFiles: 0,
		metaFiles: 0,
		totalBytes: 0,
	};

	try {
		const rootStats = await fs.stat(rootPath);
		if (!rootStats.isDirectory()) {
			return stats;
		}
		stats.exists = true;
		await walkThumbRoot(rootPath, stats);
		return stats;
	} catch (error) {
		if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
			return stats;
		}
		throw error;
	}
}

async function walkThumbRoot(dirPath: string, stats: Awaited<ReturnType<typeof inspectThumbRoot>>) {
	stats.directories += 1;
	const entries = await fs.readdir(dirPath, { withFileTypes: true });
	for (const entry of entries) {
		const entryPath = path.join(dirPath, entry.name);
		if (entry.isDirectory()) {
			await walkThumbRoot(entryPath, stats);
			continue;
		}
		if (!entry.isFile()) {
			continue;
		}
		const fileStats = await fs.stat(entryPath);
		stats.totalBytes += fileStats.size;
		if (entry.name === "meta.json") {
			stats.metaFiles += 1;
		} else {
			stats.thumbnailFiles += 1;
		}
	}
}

async function inspectThumbKv() {
	const client = await getThumbKvClient();
	if (!client) {
		return {
			configured: Boolean(thumbKvUrl),
			connectionUrl: thumbKvUrl || null,
			prefix: thumbKvPrefix,
			blobEntries: 0,
			metaEntries: 0,
		};
	}

	return {
		configured: true,
		connectionUrl: thumbKvUrl || null,
		prefix: thumbKvPrefix,
		blobEntries: await countKeys(client, `${thumbKvPrefix}:blob:*`),
		metaEntries: await countKeys(client, `${thumbKvPrefix}:meta:*`),
	};
}

async function countKeys(client: Awaited<ReturnType<typeof getThumbKvClient>>, match: string) {
	let count = 0;
	for await (const batch of client.scanIterator({ MATCH: match, COUNT: 200 })) {
		count += Array.isArray(batch) ? batch.length : 1;
	}
	return count;
}
