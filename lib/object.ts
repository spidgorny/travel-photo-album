type UnknownRecord = Record<string, unknown>;

type ValidationSchema<T extends UnknownRecord> = {
	[K in keyof T]?: (value: T[K]) => boolean;
};

export function intersect<T extends UnknownRecord, U extends UnknownRecord>(
	o1: T,
	o2: U,
): Partial<T> {
	const [k1, k2] = [Object.keys(o1), Object.keys(o2)];
	const [first, next] = k1.length > k2.length ? [k2, o1] : [k1, o2];
	const validKeys = first.filter((key) => key in next);
	return Object.fromEntries(
		validKeys.map((key) => [key, o1[key]]),
	) as Partial<T>;
}

export function objDiff<T extends UnknownRecord, U extends UnknownRecord>(
	o1: T,
	o2: U,
	includeOriginalProps = false,
): { diff: Partial<T & U>; mapping: string[] } {
	const validKeys = includeOriginalProps
		? Object.keys({ ...o1, ...o2 })
		: Object.keys(o2);
	const diffKeys = validKeys.filter((key) => o1[key] !== o2[key]);
	const mapping = diffKeys.map(
		(key) =>
			`${key}: [${typeof o1[key]}] '${String(o1[key])}' => [${typeof o2[key]}] '${String(o2[key])}'`,
	);
	const entries = diffKeys.map((key) => [key, o2[key]]);
	const diff = Object.fromEntries(entries) as Partial<T & U>;
	return { diff, mapping };
}

// https://stackoverflow.com/questions/38616612/javascript-elegant-way-to-check-object-has-required-properties
export function validate<T extends UnknownRecord>(
	object: T,
	schema: ValidationSchema<T>,
): Error[] {
	return (Object.keys(schema) as Array<keyof T>)
		.filter((key) => {
			const validator = schema[key];
			return typeof validator === "function" && !validator(object[key]);
		})
		.map((key) => new Error(`${String(key)} is invalid.`));
}

export function without<T extends UnknownRecord, K extends keyof T>(
	obj: T,
	fields: readonly K[] = [],
): Omit<T, K> & Partial<Pick<T, K>> {
	const emptyFields = Object.fromEntries(
		fields.map((field) => [field, undefined]),
	) as Partial<Record<K, undefined>>;
	return {
		...obj,
		...emptyFields,
	};
}

export function isIterable(obj: unknown): obj is Iterable<unknown> {
	if (obj == null) {
		return false;
	}
	return typeof (obj as Iterable<unknown>)[Symbol.iterator] === "function";
}

export function sumProperties<T extends UnknownRecord>(a: T, b: Partial<T>): T {
	const res = a;
	for (const key in a) {
		const left = a[key];
		const right = b[key];
		if (typeof left === "number" && typeof right === "number") {
			(a as UnknownRecord)[key] = left + right;
		}
	}
	return res;
}
