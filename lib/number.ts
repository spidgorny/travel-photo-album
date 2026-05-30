export function isNumeric(str: unknown): str is string {
	if (typeof str !== "string") {
		return false;
	}
	return !Number.isNaN(Number(str)) && !Number.isNaN(parseFloat(str));
}
