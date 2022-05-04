import { DateTime } from "luxon";

export function getNowForSQL() {
	return DateTime.now()
		.setZone("America/New_York")
		.toSQL({ includeOffset: false, includeZone: false });
}

export function sleep(seconds) {
	return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

export function humanDate(date) {
	if (typeof date === "string") {
		date = new Date(date);
	}
	return date.toISOString().substring(0, 10);
}

// https://gist.github.com/sachinKumarGautam/6f6ce23fb70eec5d03e16b504b63ae2d
export function debounce(fn, time) {
	let timeoutId;
	return wrapper;

	function wrapper(...args) {
		if (timeoutId) {
			clearTimeout(timeoutId);
		}
		timeoutId = setTimeout(() => {
			timeoutId = null;
			fn(...args);
		}, time);
	}
}

export function isSameDay(d1, d2) {
	return d1.toISOString().substring(0, 10) === d2.toISOString().substring(0, 10);
}

export function niceTime(iso) {
	const date = typeof iso === "string" ? DateTime.fromISO(iso) : DateTime.fromJSDate(iso);
	return date.toISO({ suppressMilliseconds: true, includeOffset: false })?.replace("T", " ");
}

export function niceDate(iso) {
	const date = typeof iso === "string" ? DateTime.fromISO(iso) : DateTime.fromJSDate(iso);
	return date.toISODate()?.replace("T", " ");
}

export async function awaitUntil(method, deadline) {
	while (new Date().getTime() < deadline.getTime()) {
		const res = await method();
		const okArray = Array.isArray(res) && res.length;
		const okObject = typeof res === "object" && !Array.isArray(res) && Object.keys(res).length;
		const okScalar = typeof res !== "object" && res;
		if (okArray || okObject || okScalar) {
			return res;
		}
		await sleep(1);
	}
}
