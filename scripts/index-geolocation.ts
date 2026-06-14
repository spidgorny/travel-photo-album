// @ts-nocheck
import "../lib/system/load-env.ts";
import process from "process";
import { closeRedisClient } from "../lib/system/cache.ts";
import {
	closeThumbKvClient,
	getThumbKvClient,
	thumbKvPrefix,
} from "../lib/media/thumb-store.ts";
import {
	geocodeGpsCoordinates,
	normalizeStoredGps,
} from "../lib/media/file-meta.ts";

async function main() {
	const { force } = parseArgs(process.argv.slice(2));
	const client = await getThumbKvClient();
	if (!client) {
		throw new Error("Kvrocks is not configured or unavailable");
	}

	let scannedKeys = 0;
	let updatedKeys = 0;
	let scannedEntries = 0;
	let filesWithStoredMeta = 0;
	let filesWithGps = 0;
	let filesWithResolvedCity = 0;
	let filesWithExistingLocation = 0;
	let skippedAlreadyHasLocation = 0;
	let skippedNoCityMatch = 0;
	let skippedUnchanged = 0;
	let updatedEntries = 0;
	let invalidJsonKeys = 0;
	const match = `${thumbKvPrefix}:directory-meta:*`;

	console.log(`Scanning ${match}...`);

	for await (const batch of client.scanIterator({ MATCH: match, COUNT: 200 })) {
		const keys = Array.isArray(batch) ? batch : [batch];
		for (const key of keys) {
			if (typeof key !== "string" || !key.length) {
				continue;
			}
			scannedKeys += 1;
			const raw = await client.get(key);
			if (!raw) {
				continue;
			}

			let parsed;
			try {
				parsed = JSON.parse(raw);
			} catch {
				invalidJsonKeys += 1;
				console.warn(`skip ${key} (invalid JSON)`);
				continue;
			}
			if (!parsed || typeof parsed !== "object") {
				continue;
			}

			let keyChanged = false;
			for (const [fileName, entry] of Object.entries(parsed)) {
				if (!entry || typeof entry !== "object") {
					continue;
				}
				scannedEntries += 1;
				filesWithStoredMeta += 1;
				const gps = normalizeStoredGps(entry.GPS);
				if (!gps) {
					continue;
				}
				filesWithGps += 1;
				const location = geocodeGpsCoordinates(gps);
				const gpsLabel = `${gps.latitude.toFixed(6)}, ${gps.longitude.toFixed(6)}`;
				const locationLabel = location
					? [location.label, location.countryName].filter(Boolean).join(", ")
					: "no city match";
				if (location) {
					filesWithResolvedCity += 1;
				}
				if (!force && entry.location && typeof entry.location === "object") {
					filesWithExistingLocation += 1;
					skippedAlreadyHasLocation += 1;
					console.log(
						`skip ${key} :: ${fileName} :: GPS ${gpsLabel} -> ${locationLabel} (already has location)`,
					);
					continue;
				}
				if (!location) {
					skippedNoCityMatch += 1;
					console.log(`skip ${key} :: ${fileName} :: GPS ${gpsLabel} -> no city match`);
					continue;
				}
				const previousLocation = JSON.stringify(entry.location ?? null);
				const nextLocation = JSON.stringify(location);
				if (previousLocation === nextLocation) {
					skippedUnchanged += 1;
					console.log(
						`skip ${key} :: ${fileName} :: GPS ${gpsLabel} -> ${locationLabel} (unchanged)`,
					);
					continue;
				}
				parsed[fileName] = {
					...entry,
					location,
				};
				keyChanged = true;
				updatedEntries += 1;
				console.log(`update ${key} :: ${fileName} :: GPS ${gpsLabel} -> ${locationLabel}`);
			}

			if (!keyChanged) {
				continue;
			}

			await client.set(key, JSON.stringify(parsed));
			updatedKeys += 1;
			console.log(`updated ${key}`);
		}
	}

	console.log("Geolocation index complete:");
	console.log(`  keys scanned: ${scannedKeys}`);
	console.log(`  keys updated: ${updatedKeys}`);
	console.log(`  keys with invalid JSON: ${invalidJsonKeys}`);
	console.log(`  files scanned: ${scannedEntries}`);
	console.log(`  files with stored metadata: ${filesWithStoredMeta}`);
	console.log(`  files with GPS EXIF: ${filesWithGps}`);
	console.log(`  files with detected city: ${filesWithResolvedCity}`);
	console.log(`  files already containing location: ${filesWithExistingLocation}`);
	console.log(`  files updated: ${updatedEntries}`);
	console.log(`  skipped (already has location): ${skippedAlreadyHasLocation}`);
	console.log(`  skipped (no city match): ${skippedNoCityMatch}`);
	console.log(`  skipped (unchanged): ${skippedUnchanged}`);
}

function parseArgs(args) {
	return {
		force: args.includes("--force"),
	};
}

main()
	.catch((error) => {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	})
	.finally(async () => {
		await Promise.allSettled([closeThumbKvClient(), closeRedisClient()]);
	});
