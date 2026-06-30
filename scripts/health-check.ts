/**
 * Health-check script: verifies connectivity and access for all infrastructure
 * services used by travel-photo-album.
 *
 * Checks:
 *  1. Kvrocks (thumbnail KV store) — redis://<THUMB_KV_URL>
 *  2. Redis / BullMQ (queue store) — redis://<BULLMQ_REDIS_URL | THUMB_QUEUE_URL>
 *  3. Typesense (search) — HTTP health endpoint
 *  4. Mounted media folder (MEDIA_ROOT_HOST_PATH / MEDIA_ROOT_CONTAINER_PATH)
 *  5. Config sections — each configured section path exists and is readable
 *  6. Data directory — ./data is writable
 *
 * Usage:
 *   npx tsx scripts/health-check.ts
 *   npm run health-check          (if added to package.json scripts)
 */

import "../lib/system/load-env.ts";

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "redis";
import axios from "axios";

// ─── Load config.json directly so this script doesn't crash if the module's
//     relative-path resolution is wrong in a particular environment. ──────────

interface RawConfigSection {
	name: string;
	dockerPath?: string;
	linuxPath?: string;
	macPath?: string;
	winPath?: string;
	path?: string;
	[key: string]: unknown;
}

interface AppConfig {
	sections: RawConfigSection[];
}

function loadRawConfig(): AppConfig {
	// Try well-known locations in order: repo root (where package.json lives),
	// then lib/, then lib/config/ — to be robust across refactors.
	const scriptDir = path.dirname(fileURLToPath(import.meta.url));
	const candidates = [
		path.join(scriptDir, "..", "config.json"),       // <repo>/config.json (scripts/../)
		path.join(scriptDir, "..", "lib", "config.json"), // <repo>/lib/config.json
		path.join(process.cwd(), "config.json"),          // cwd/config.json
	];
	for (const candidate of candidates) {
		try {
			const raw = fs.readFileSync(candidate, "utf8");
			return JSON.parse(raw) as AppConfig;
		} catch {
			// try next
		}
	}
	return { sections: [] };
}

const rawConfig = loadRawConfig();

// Resolve the runtime path for each section (mirrors lib/config/config.ts logic)
function resolveSection(section: RawConfigSection): RawConfigSection & { resolvedPath?: string } {
	const platform = process.platform;
	const isDocker =
		process.env.DOCKER_CONTAINER?.trim() === "1" ||
		fs.existsSync("/.dockerenv");

	let resolvedPath: string | undefined;
	if (isDocker || (platform === "linux" && fs.existsSync("/.dockerenv"))) {
		resolvedPath = section.dockerPath ?? section.linuxPath;
	} else if (platform === "darwin") {
		resolvedPath = section.macPath;
	} else if (platform === "linux") {
		resolvedPath = section.linuxPath;
	} else if (platform === "win32") {
		resolvedPath = section.winPath;
	}
	resolvedPath = resolvedPath ?? section.path;
	return { ...section, resolvedPath };
}

const config = {
	sections: (rawConfig.sections ?? []).map(resolveSection),
};

// ─── ANSI helpers ────────────────────────────────────────────────────────────

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

function ok(label: string, detail = "") {
	console.log(`${GREEN}  ✓${RESET} ${label}${detail ? `  ${detail}` : ""}`);
}

function fail(label: string, detail = "") {
	console.log(`${RED}  ✗${RESET} ${label}${detail ? `  ${detail}` : ""}`);
}

function warn(label: string, detail = "") {
	console.log(`${YELLOW}  !${RESET} ${label}${detail ? `  ${detail}` : ""}`);
}

function header(title: string) {
	console.log(`\n${YELLOW}▶${RESET} ${title}`);
}

// ─── Redis / Kvrocks probe ────────────────────────────────────────────────────

async function probeRedisUrl(
	url: string,
	label: string,
	timeoutMs = 3000,
): Promise<boolean> {
	if (!url) {
		warn(label, "(not configured — skipped)");
		return false;
	}
	const client = createClient({
		url,
		socket: {
			connectTimeout: timeoutMs,
			reconnectStrategy: false,
		},
	});
	try {
		await client.connect();
		const pong = await client.ping();
		if (pong === "PONG") {
			// Try a quick write/read/delete to confirm read-write access
			const testKey = "__health_check_probe__";
			await client.set(testKey, "1", { EX: 5 });
			const val = await client.get(testKey);
			await client.del(testKey);
			if (val === "1") {
				ok(label, `(${url})`);
			} else {
				warn(label, `PING OK but write/read test returned unexpected value: ${val}`);
			}
			return true;
		}
		fail(label, `unexpected PING response: ${pong}`);
		return false;
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		fail(label, msg);
		return false;
	} finally {
		await client.quit().catch(() => {});
	}
}

// ─── Typesense probe ─────────────────────────────────────────────────────────

async function probeTypesense(): Promise<boolean> {
	const protocol = process.env.TYPESENSE_PROTOCOL?.trim() || "http";
	const host = process.env.TYPESENSE_HOST?.trim() || "127.0.0.1";
	const port = process.env.TYPESENSE_PORT?.trim() || "8108";
	const apiKey = process.env.TYPESENSE_API_KEY?.trim() || "";
	const collection = process.env.TYPESENSE_COLLECTION?.trim() || "";

	const healthUrl = `${protocol}://${host}:${port}/health`;
	const collectionUrl = collection
		? `${protocol}://${host}:${port}/collections/${collection}`
		: null;

	if (!host) {
		warn("Typesense", "(TYPESENSE_HOST not set — skipped)");
		return false;
	}

	// 1. Health endpoint
	try {
		const res = await axios.get<{ ok: boolean }>(healthUrl, { timeout: 3000 });
		if (res.data?.ok) {
			ok("Typesense health", `(${healthUrl})`);
		} else {
			warn("Typesense health", `unexpected response: ${JSON.stringify(res.data)}`);
		}
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		fail("Typesense health", msg);
		return false;
	}

	// 2. Collection existence
	if (collectionUrl && apiKey) {
		try {
			const res = await axios.get(collectionUrl, {
				headers: { "X-TYPESENSE-API-KEY": apiKey },
				timeout: 3000,
			});
			const numDocs = (res.data as { num_documents?: number }).num_documents ?? "?";
			ok("Typesense collection", `"${collection}" — ${numDocs} documents`);
		} catch (err) {
			const status =
				axios.isAxiosError(err) && err.response?.status
					? err.response.status
					: null;
			if (status === 404) {
				warn("Typesense collection", `"${collection}" does not exist yet`);
			} else {
				const msg = err instanceof Error ? err.message : String(err);
				fail("Typesense collection", msg);
			}
		}
	} else if (!apiKey) {
		warn("Typesense collection", "(TYPESENSE_API_KEY not set — collection check skipped)");
	}

	return true;
}

// ─── Folder / path probe ─────────────────────────────────────────────────────

function probeDir(
	label: string,
	dirPath: string | undefined,
	options: { writable?: boolean; optional?: boolean } = {},
): boolean {
	if (!dirPath) {
		if (options.optional) {
			warn(label, "(path not configured — skipped)");
		} else {
			fail(label, "path not configured");
		}
		return false;
	}

	// Existence
	let stat: fs.Stats;
	try {
		stat = fs.statSync(dirPath);
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		if (options.optional) {
			warn(label, msg);
		} else {
			fail(label, msg);
		}
		return false;
	}

	if (!stat.isDirectory()) {
		fail(label, `${dirPath} exists but is not a directory`);
		return false;
	}

	// Readability
	try {
		fs.accessSync(dirPath, fs.constants.R_OK);
	} catch {
		fail(label, `${dirPath} — read permission denied`);
		return false;
	}

	// Count top-level entries as a quick liveness check
	let entries: string[] = [];
	try {
		entries = fs.readdirSync(dirPath);
	} catch {
		// readable but empty — still OK
	}

	// Write probe
	if (options.writable) {
		const probe = path.join(dirPath, ".health_check_write_probe");
		try {
			fs.writeFileSync(probe, "ok");
			fs.unlinkSync(probe);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			fail(label, `${dirPath} — not writable: ${msg}`);
			return false;
		}
		ok(label, `${dirPath} (${entries.length} entries, writable)`);
	} else {
		ok(label, `${dirPath} (${entries.length} entries)`);
	}

	return true;
}

// ─── Config sections probe ────────────────────────────────────────────────────

function probeSections() {
	const sections = config.sections ?? [];
	if (!sections.length) {
		warn("Config sections", "no sections defined in config.json");
		return;
	}

	for (const section of sections) {
		const sectionLabel = `Section "${section.name}"`;
		if (!section.resolvedPath) {
			warn(sectionLabel, "no resolved path (section may be for another OS)");
			continue;
		}
		probeDir(sectionLabel, section.resolvedPath, { optional: true });
	}
}

// ─── Ollama probe (optional) ─────────────────────────────────────────────────

async function probeOllama(): Promise<void> {
	const baseUrl = process.env.OLLAMA_BASE_URL?.trim();
	if (!baseUrl) {
		warn("Ollama", "(OLLAMA_BASE_URL not set — skipped)");
		return;
	}

	try {
		const res = await axios.get<unknown>(`${baseUrl}/api/tags`, { timeout: 3000 });
		const models = (res.data as { models?: Array<{ name: string }> }).models ?? [];
		const modelNames = models.map((m) => m.name).join(", ") || "(none)";
		ok("Ollama", `${baseUrl} — models: ${modelNames}`);
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		warn("Ollama", `${baseUrl} — ${msg}`);
	}
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
	console.log("\ntravel-photo-album health check\n" + "=".repeat(40));

	const results: boolean[] = [];

	// 1. Kvrocks
	header("Kvrocks (thumbnail KV store)");
	const kvrocksUrl =
		process.env.THUMB_KV_URL?.trim() || process.env.REDIS_URL?.trim() || "";
	results.push(await probeRedisUrl(kvrocksUrl, "Kvrocks", 3000));

	// 2. Redis (BullMQ queue)
	header("Redis (BullMQ / queue store)");
	const redisUrl =
		process.env.BULLMQ_REDIS_URL?.trim() ||
		process.env.THUMB_QUEUE_URL?.trim() ||
		process.env.REDIS_URL?.trim() ||
		"";
	// Only probe if it differs from kvrocks (port is usually different)
	if (redisUrl && redisUrl !== kvrocksUrl) {
		results.push(await probeRedisUrl(redisUrl, "Redis", 3000));
	} else if (redisUrl === kvrocksUrl) {
		warn("Redis", `same URL as Kvrocks (${redisUrl}) — no separate probe needed`);
	} else {
		warn("Redis", "(not configured — skipped)");
	}

	// 3. Typesense
	header("Typesense (search)");
	results.push(await probeTypesense());

	// 4. Media root mount
	header("Media root mount");
	const mediaRootHost = process.env.MEDIA_ROOT_HOST_PATH?.trim();
	const mediaRootContainer = process.env.MEDIA_ROOT_CONTAINER_PATH?.trim();
	// Try container path first (we might be inside Docker), then host path
	const mediaRootToCheck = mediaRootContainer || mediaRootHost;
	if (mediaRootToCheck) {
		results.push(probeDir("Media root", mediaRootToCheck, { optional: false }));
	} else {
		warn("Media root", "(neither MEDIA_ROOT_CONTAINER_PATH nor MEDIA_ROOT_HOST_PATH set — skipped)");
	}

	// 5. Config sections
	header("Config sections (config.json)");
	probeSections();

	// 6. Data directory
	header("Data directory (./data)");
	const dataDir = path.resolve(process.cwd(), "data");
	probeDir("Data dir", dataDir, { writable: true, optional: true });

	// 7. Ollama (optional)
	header("Ollama (optional — AI captions)");
	await probeOllama();

	// ─── Summary ───────────────────────────────────────────────────────────────
	console.log("\n" + "=".repeat(40));
	const failures = results.filter((r) => !r).length;
	if (failures === 0) {
		console.log(`${GREEN}All required checks passed.${RESET}\n`);
		process.exitCode = 0;
	} else {
		console.log(`${RED}${failures} check(s) failed.${RESET}\n`);
		process.exitCode = 1;
	}
}

main().catch((err) => {
	console.error("Unexpected error during health check:", err);
	process.exitCode = 1;
});
