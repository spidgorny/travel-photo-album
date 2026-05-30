import type { ConfigSection } from "./config";

export type CatchAllQueryValue = string | string[] | undefined | null;

export interface ApiErrorPayload {
status: "error";
message: string;
stack?: string[];
[key: string]: unknown;
}

export function getCatchAllSegments(value: CatchAllQueryValue): string[] {
if (Array.isArray(value)) {
return value;
}
if (typeof value === "string" && value.length > 0) {
return [value];
}
return [];
}

export function getFirstQueryValue(value: CatchAllQueryValue): string | undefined {
if (Array.isArray(value)) {
	return value[0];
}

return typeof value === "string" ? value : undefined;
}

export function getNumericSectionId(
sectionInput: string | undefined,
fallback: CatchAllQueryValue,
): number {
return Number(sectionInput ?? getFirstQueryValue(fallback));
}

export function getSectionById(
sections: ConfigSection[],
sectionId: string | number | undefined,
): ConfigSection | undefined {
const index = typeof sectionId === "number" ? sectionId : Number(sectionId);
return Number.isInteger(index) ? sections[index] : undefined;
}

export function toError(error: unknown): Error {
if (error instanceof Error) {
return error;
}
return new Error(typeof error === "string" ? error : "Unknown error");
}

export function jsonError(
error: unknown,
extra: Record<string, unknown> = {},
): ApiErrorPayload {
const err = toError(error);
return {
...extra,
status: "error",
message: err.message,
stack: err.stack?.split("\n"),
};
}
