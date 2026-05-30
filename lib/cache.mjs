import cache from "memory-cache";
import crypto from "crypto";
import { createClient } from "redis";

const myCache = new cache.Cache();
const defaultFolderCacheTtlSeconds = 0;
const parsedFolderCacheTtlSeconds = Number(
	process.env.REDIS_FOLDER_CACHE_TTL_SECONDS ?? defaultFolderCacheTtlSeconds,
);
const folderCacheTtlSeconds =
	Number.isFinite(parsedFolderCacheTtlSeconds) && parsedFolderCacheTtlSeconds >= 0
		? parsedFolderCacheTtlSeconds
		: defaultFolderCacheTtlSeconds;
const folderCacheTtlMs =
	folderCacheTtlSeconds > 0 ? folderCacheTtlSeconds * 1000 : null;
const redisUrl = process.env.REDIS_URL?.trim();

let redisClientPromise = null;
let redisDisabled = !redisUrl;
let redisWarningWasShown = false;

function warnRedis(message, error = null) {
	if (redisWarningWasShown) {
		return;
	}
	redisWarningWasShown = true;
	console.warn("redis-folder-cache", message, error?.message ?? "");
}

function buildCacheKey(code, vars) {
	const shasum = crypto.createHash("sha1");
	const hash = shasum.update(JSON.stringify(vars)).digest("hex");
	return `travel-photo-album:${code}:${hash}`;
}

function serializeForCache(value) {
	if (value instanceof Date) {
		return {
			__magicCacheType: "Date",
			value: value.toISOString(),
		};
	}
	if (Array.isArray(value)) {
		return value.map(serializeForCache);
	}
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value).map(([key, nestedValue]) => [
				key,
				serializeForCache(nestedValue),
			]),
		);
	}
	return value;
}

function deserializeFromCache(value) {
	if (Array.isArray(value)) {
		return value.map(deserializeFromCache);
	}
	if (value && typeof value === "object") {
		if (value.__magicCacheType === "Date") {
			return new Date(value.value);
		}
		return Object.fromEntries(
			Object.entries(value).map(([key, nestedValue]) => [
				key,
				deserializeFromCache(nestedValue),
			]),
		);
	}
	return value;
}

async function getRedisClient() {
	if (redisDisabled) {
		return null;
	}
	if (!redisClientPromise) {
		const client = createClient({
			url: redisUrl,
			socket: {
				connectTimeout: 1000,
				reconnectStrategy: false,
			},
		});
		client.on("error", (error) => {
			redisDisabled = true;
			warnRedis("disabling redis-backed folder cache", error);
		});
		redisClientPromise = client
			.connect()
			.then(() => client)
			.catch((error) => {
				redisDisabled = true;
				warnRedis("redis unavailable, using in-memory folder cache only", error);
				return null;
			});
	}
	return redisClientPromise;
}

async function getRedisValue(cacheKey) {
	const client = await getRedisClient();
	if (!client) {
		return null;
	}
	try {
		const rawValue = await client.get(cacheKey);
		if (!rawValue) {
			return null;
		}
		return deserializeFromCache(JSON.parse(rawValue));
	} catch (error) {
		redisDisabled = true;
		warnRedis("failed reading from redis folder cache", error);
		return null;
	}
}

async function setRedisValue(cacheKey, value) {
	const client = await getRedisClient();
	if (!client) {
		return;
	}
	try {
		const serializedValue = JSON.stringify(serializeForCache(value));
		if (folderCacheTtlSeconds > 0) {
			await client.set(cacheKey, serializedValue, {
				EX: folderCacheTtlSeconds,
			});
			return;
		}
		await client.set(cacheKey, serializedValue);
	} catch (error) {
		redisDisabled = true;
		warnRedis("failed writing to redis folder cache", error);
	}
}

// will hash the vars
export async function magicCache(code, slowCode, ...vars) {
	const cacheKey = buildCacheKey(code, vars);
	let value = myCache.get(cacheKey);
	if (value !== null && value !== undefined) {
		console.warn("magic-cache", "MEMORY HIT", cacheKey);
		return value;
	}

	value = await getRedisValue(cacheKey);
	if (value !== null && value !== undefined) {
		myCache.put(cacheKey, value, folderCacheTtlMs);
		console.warn("magic-cache", "REDIS HIT", cacheKey);
		return value;
	}

	value = await slowCode(...vars);
	myCache.put(cacheKey, value, folderCacheTtlMs);
	await setRedisValue(cacheKey, value);
	return value;
}
