import { DateTime } from "luxon";
import { NextResponse } from "next/server";
import invariant from "tiny-invariant";
import config from "../../../../lib/config/config";
import { getSectionById, getSectionIndex } from "../../../../lib/api/api-route";
import { isValidDate } from "../../../../lib/utils/date";
import {
	getStoredMetaDirectoryKey,
	normalizeStoredDescription,
	normalizeStoredPhash,
	readStoredMetaDirectory,
} from "../../../../lib/media/file-meta";
import { formatDayKey, getFilesWithOptionalDates, parseDayKey } from "../../../../lib/media/files";
import type { StoredDirectoryMetaEntry } from "../../../../lib/media/files-types";
import { getImageDimensions } from "../../../../lib/media/thumb-store";
import type { DatedFileEntry, FileEntryWithOptionalDate } from "../../../../lib/media/files-types";

const UNDATED_BUCKET = "undated";

interface RouteContext {
	params: Promise<{
		slug?: string[];
	}>;
}

export async function GET(request: Request, { params }: RouteContext) {
	const startedAt = Date.now();
	try {
		const { slug = [] } = await params;
		const [sectionInput, ...filePathWithDate] = slug;
		const url = new URL(request.url);
		const dateInput = filePathWithDate.pop();
		const section = getSectionById(config.sections, sectionInput);
		invariant(section, "section");
		const sectionId = getSectionIndex(config.sections, section);
		invariant(dateInput, "date missing");

		const searchQuery = normalizeSearchQuery(url.searchParams.get("q"));
		const isUndatedBucket = dateInput === UNDATED_BUCKET;
		const dayKey = isUndatedBucket ? null : parseDayKey(dateInput);
		if (!isUndatedBucket) {
			const date = new Date(dateInput);
			invariant(isValidDate(date), "date missing");
			invariant(dayKey, "date missing");
		}

		let files = (await getFilesWithOptionalDates(section, filePathWithDate, { kvOnly: true })) ?? [] as FileEntryWithOptionalDate[];
		files = files.filter((file) =>
			isUndatedBucket ? !file.date : Boolean(file.date && formatDayKey(file.date) === dayKey),
		);
		files = files.filter((file) => !file.isDir);
		const metaCache = new Map<string, Promise<Record<string, StoredDirectoryMetaEntry>>>();
		let responseFiles = await Promise.all(
			files.map(async (file) => {
				const filePath = String(file.dirPath ?? file.path)
					.split("/")
					.filter(Boolean);
				const directoryPath = filePath.slice(0, -1);
				const metaCacheKey = getStoredMetaDirectoryKey(section, directoryPath);
				const directoryMetaPromise =
					metaCache.get(metaCacheKey) ?? readStoredMetaDirectory(section, directoryPath);
				metaCache.set(metaCacheKey, directoryMetaPromise);
				const [dimensions, storedMeta] = await Promise.all([
					getImageDimensions(section, filePath, undefined, undefined, { kvOnly: true }),
					directoryMetaPromise.then((directoryMeta) => directoryMeta[pathBaseName(filePath)] ?? null),
				]);
				return {
					...file,
					width: dimensions.width,
					height: dimensions.height,
					dominantColor: dimensions.dominantColor,
					description: normalizeStoredDescription(storedMeta?.description),
					phash: normalizeStoredPhash(storedMeta?.phash),
					original: {
						width: dimensions.width,
						height: dimensions.height,
					},
				};
			}),
		);
		if (searchQuery) {
			responseFiles = responseFiles.filter((file) =>
				normalizeStoredDescription(file.description)?.toLocaleLowerCase().includes(searchQuery),
			);
		}

		return NextResponse.json(
			{ sectionId, section, files: responseFiles, runtime: Date.now() - startedAt },
			{
				headers: {
					"Cache-Control": "public, s-maxage=6000",
					Expires: DateTime.now().plus({ days: 30 }).toHTTP() ?? "",
				},
			},
		);
	} catch (error) {
		const err = error instanceof Error ? error : new Error(String(error));
		return NextResponse.json(
			{
				status: "error",
				message: err.message,
				stack: err.stack ? err.stack.split("\n") : undefined,
			},
			{ status: 500 },
		);
	}
}

function normalizeSearchQuery(value: string | null) {
	if (typeof value !== "string") {
		return null;
	}
	const normalized = value.trim().toLocaleLowerCase();
	return normalized.length ? normalized : null;
}

function pathBaseName(filePath: string[]) {
	return filePath[filePath.length - 1] ?? "";
}
