import config from "./config";
import { getThumbKvClient, thumbKvPrefix, thumbKvUrl } from "./thumb-store";

export async function getThumbStorageInfo() {
	const sections = Array.isArray(config?.sections) ? config.sections : [];

	return {
		configuredSections: sections.length,
		kv: await inspectThumbKv(),
	};
}

async function inspectThumbKv() {
	const client = await getThumbKvClient();
	if (!client) {
		return {
			configured: Boolean(thumbKvUrl),
			connectionUrl: thumbKvUrl || null,
			prefix: thumbKvPrefix,
			blobEntries: 0,
			thumbnailMetaEntries: 0,
			directoryMetaKeys: 0,
			fileMetadataEntries: 0,
			gpsEntries: 0,
			locationEntries: 0,
			descriptionEntries: 0,
			phashEntries: 0,
			totalKeys: null,
			usedMemoryBytes: null,
			usedMemoryHuman: null,
		};
	}

	const [blobEntries, thumbnailMetaEntries, directoryMetaStats, totalKeys, memory] =
		await Promise.all([
			countKeys(client, `${thumbKvPrefix}:blob:*`),
			countKeys(client, `${thumbKvPrefix}:meta:*`),
			inspectDirectoryMetaEntries(client),
			getDbSize(client),
			getMemoryInfo(client),
		]);

	return {
		configured: true,
		connectionUrl: thumbKvUrl || null,
		prefix: thumbKvPrefix,
		blobEntries,
		thumbnailMetaEntries,
		directoryMetaKeys: directoryMetaStats.directoryMetaKeys,
		fileMetadataEntries: directoryMetaStats.fileMetadataEntries,
		gpsEntries: directoryMetaStats.gpsEntries,
		locationEntries: directoryMetaStats.locationEntries,
		descriptionEntries: directoryMetaStats.descriptionEntries,
		phashEntries: directoryMetaStats.phashEntries,
		totalKeys,
		usedMemoryBytes: memory.usedMemoryBytes,
		usedMemoryHuman: memory.usedMemoryHuman,
	};
}

async function inspectDirectoryMetaEntries(
	client: Awaited<ReturnType<typeof getThumbKvClient>>,
) {
	const stats = {
		directoryMetaKeys: 0,
		fileMetadataEntries: 0,
		gpsEntries: 0,
		locationEntries: 0,
		descriptionEntries: 0,
		phashEntries: 0,
	};

	for await (const batch of client.scanIterator({
		MATCH: `${thumbKvPrefix}:directory-meta:*`,
		COUNT: 100,
	})) {
		const keys = normalizeScanBatch(batch);
		if (!keys.length) {
			continue;
		}

		stats.directoryMetaKeys += keys.length;
		const payloads = await client.mGet(keys);
		for (const raw of payloads) {
			if (typeof raw !== "string" || raw.length === 0) {
				continue;
			}

			let parsed: Record<string, unknown>;
			try {
				parsed = JSON.parse(raw) as Record<string, unknown>;
			} catch {
				continue;
			}

			for (const metaEntry of Object.values(parsed)) {
				if (!metaEntry || typeof metaEntry !== "object") {
					continue;
				}

				stats.fileMetadataEntries += 1;
				const candidate = metaEntry as Record<string, unknown>;
				if (hasGps(candidate.GPS)) {
					stats.gpsEntries += 1;
				}
				if (hasLocation(candidate.location)) {
					stats.locationEntries += 1;
				}
				if (hasNonEmptyString(candidate.description)) {
					stats.descriptionEntries += 1;
				}
				if (hasNonEmptyString(candidate.phash)) {
					stats.phashEntries += 1;
				}
			}
		}
	}

	return stats;
}

async function countKeys(
	client: Awaited<ReturnType<typeof getThumbKvClient>>,
	match: string,
) {
	let count = 0;
	for await (const batch of client.scanIterator({ MATCH: match, COUNT: 200 })) {
		count += normalizeScanBatch(batch).length;
	}
	return count;
}

async function getDbSize(client: Awaited<ReturnType<typeof getThumbKvClient>>) {
	try {
		return await client.dbSize();
	} catch {
		return null;
	}
}

async function getMemoryInfo(client: Awaited<ReturnType<typeof getThumbKvClient>>) {
	try {
		const raw = await client.info("memory");
		return {
			usedMemoryBytes: parseIntegerInfoValue(raw, "used_memory"),
			usedMemoryHuman: parseStringInfoValue(raw, "used_memory_human"),
		};
	} catch {
		return {
			usedMemoryBytes: null,
			usedMemoryHuman: null,
		};
	}
}

function parseIntegerInfoValue(raw: string, key: string) {
	const value = parseStringInfoValue(raw, key);
	if (!value) {
		return null;
	}
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function parseStringInfoValue(raw: string, key: string) {
	const prefix = `${key}:`;
	for (const line of raw.split(/\r?\n/)) {
		if (line.startsWith(prefix)) {
			return line.slice(prefix.length).trim() || null;
		}
	}
	return null;
}

function normalizeScanBatch(batch: unknown) {
	if (Array.isArray(batch)) {
		return batch.filter((value): value is string => typeof value === "string");
	}
	return typeof batch === "string" ? [batch] : [];
}

function hasGps(value: unknown) {
	if (!value || typeof value !== "object") {
		return false;
	}
	const candidate = value as Record<string, unknown>;
	return (
		Number.isFinite(candidate.latitude as number) &&
		Number.isFinite(candidate.longitude as number)
	);
}

function hasLocation(value: unknown) {
	if (!value || typeof value !== "object") {
		return false;
	}
	const candidate = value as Record<string, unknown>;
	return hasNonEmptyString(candidate.label) || hasNonEmptyString(candidate.locality);
}

function hasNonEmptyString(value: unknown) {
	return typeof value === "string" && value.trim().length > 0;
}
