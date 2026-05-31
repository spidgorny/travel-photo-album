function encodePathValue(value: string | number) {
	return String(value)
		.split("/")
		.filter(Boolean)
		.map((segment) => encodeURIComponent(segment));
}

export function buildApiPath(basePath: string, ...values: Array<string | number | undefined>) {
	const encodedSegments = values.flatMap((value) =>
		value === undefined || value === null || value === "" ? [] : encodePathValue(value),
	);
	return encodedSegments.length > 0 ? `${basePath}/${encodedSegments.join("/")}` : basePath;
}

export function buildHomeHref(sectionId: number, folderPath?: string) {
	const query = new URLSearchParams({ section: String(sectionId) });
	if (folderPath) {
		query.set("folder", folderPath);
	}
	return `/?${query.toString()}`;
}

export function buildDayAnchorId(date: string) {
	return `day-${date}`;
}

export function buildHomeDayHref(sectionId: number, folderPath: string | undefined, date: string) {
	return `${buildHomeHref(sectionId, folderPath)}#${buildDayAnchorId(date)}`;
}

export function createGoogleMapsHref(location: string) {
	return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
}
