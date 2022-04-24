export function intersect(o1, o2) {
	const [k1, k2] = [Object.keys(o1), Object.keys(o2)];
	// console.log(k1, k2);
	const [first, next] = k1.length > k2.length ? [k2, o1] : [k1, o2];
	const validKeys = first.filter((k) => k in next);
	// console.log({ validKeys });
	// @ts-ignore
	return Object.fromEntries(validKeys.map((x) => [x, o1[x]]));
}

export function objDiff(o1, o2, includeOriginalProps) {
	const validKeys = includeOriginalProps ? Object.keys({ ...o1, ...o2 }) : Object.keys(o2);
	let diffKeys = validKeys.filter((x) => o1[x] !== o2[x]);
	const mapping = diffKeys.map(
		(x) => `${x}: [${typeof o1[x]}] '${o1[x]}' => [${typeof o2[x]}] '${o2[x]}'`
	);
	const entries = diffKeys.map((x) => [x, o2[x]]);
	const diff = Object.fromEntries(entries);
	return { diff, mapping };
}

// https://stackoverflow.com/questions/38616612/javascript-elegant-way-to-check-object-has-required-properties
//	object: Record<string, any>,
// 	schema: Record<string, (val: any) => boolean>
export const validate = (object, schema) =>
	Object.keys(schema)
		.filter((key) => !schema[key](object[key]))
		.map((key) => new Error(`${key} is invalid.`));

export function without(obj, fields = []) {
	const emptyFields = Object.fromEntries(fields.map((x) => [x, undefined]));
	return {
		...obj,
		...emptyFields,
	};
}

export function isIterable(obj) {
	// checks for null and undefined
	if (obj == null) {
		return false;
	}
	return typeof obj[Symbol.iterator] === "function";
}

export function sumProperties(a, b) {
	const res = a; // default
	for (let key in a) {
		if (typeof a[key] === "number" && typeof b[key] === "number") {
			res[key] = a[key] + b[key];
		}
	}
	return res;
}
