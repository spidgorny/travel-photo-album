"use client";

interface DebugProps {
	data: unknown;
}

export function isBrowser() {
	return typeof document === "object";
}

export function Debug({ data }: DebugProps) {
	if (!isBrowser() || !document.location.href.includes("localhost")) {
		return null;
	}

	return <pre>{JSON.stringify(data, null, 2)}</pre>;
}
