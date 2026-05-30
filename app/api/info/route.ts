import fs from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import config from "../../../lib/config";
import { jsonError } from "../../../lib/api-route";
import { getQueueInfo } from "../../../lib/queue-info";
import {
	getThumbKvClient,
	thumbKvPrefix,
	thumbKvUrl,
} from "../../../lib/thumb-store";

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
