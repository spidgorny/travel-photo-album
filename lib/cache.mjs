import cache from "memory-cache";
import crypto from "crypto";

const myCache = new cache.Cache();

// will hash the vars
export async function magicCache(code, slowCode, ...vars) {
	const shasum = crypto.createHash("sha1");
	const hash = shasum.update(JSON.stringify(vars)).digest("hex");
	let value = myCache.get(hash);
	if (value) {
		console.warn("magic-cache", "HIT", hash);
		return value;
	}

	// console.log('magic', vars)
	value = await slowCode(...vars);
	myCache.put(hash, value);
	return value;
}
