import crypto from "crypto";
import type { ConfigSection } from "./config.ts";
import { getThumbKvClient, thumbKvPrefix } from "./thumb-store.ts";

interface StoredFolderEntry {
	path: string; // filename (basename)
	isDir: boolean;
	ctime: string | null; // ISO-8601 or null
}

const folderListingKind = "folder-listing:v1";

export function buildFolderListingKey(
	sectionName: string,
	folderRelPath: string,
): string {
	const hash = crypto
		.createHash("sha1")
		.update(
			JSON.stringify({ sectionName, folderRelPath, kind: folderListingKind }),
		)
		.digest("hex");
	return `${thumbKvPrefix}:folder:${hash}`;
}

export async function storeFolderListing(
	section: ConfigSection,
	folderPath: string[],
	entries: ReadonlyArray<{
		name: string;
		isDirectory(): boolean;
		ctime?: Date | null;
		mtime?: Date | null;
	}>,
): Promise<void> {
	if (!section.name) return;
	const client = await getThumbKvClient();
	if (!client) return;

	const relPath = folderPath.join("/");
	const key = buildFolderListingKey(section.name, relPath);
	const stored: StoredFolderEntry[] = entries.map((entry) => ({
		path: entry.name,
		isDir: entry.isDirectory(),
		ctime: entry.ctime?.toISOString() ?? entry.mtime?.toISOString() ?? null,
	}));

	try {
		await client.set(key, JSON.stringify(stored));
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : String(err);
		console.warn("folder-store: store failed:", msg);
	}
}

export async function readStoredFolderListing(
	section: ConfigSection,
	folderPath: string[],
): Promise<Array<{
	path: string;
	isDir: boolean;
	stats: { ctime: Date | null };
}> | null> {
	if (!section.name) return null;
	const client = await getThumbKvClient();
	if (!client) return null;

	const relPath = folderPath.join("/");
	const key = buildFolderListingKey(section.name, relPath);

	try {
		const raw = await client.get(key);
		if (!raw) return null;
		const stored = JSON.parse(raw) as StoredFolderEntry[];
		return stored.map((entry) => ({
			path: entry.path,
			isDir: entry.isDir,
			stats: { ctime: entry.ctime ? new Date(entry.ctime) : null },
		}));
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : String(err);
		console.warn("folder-store: read failed:", msg);
		return null;
	}
}
