import { DateTime } from "luxon";
import { NextResponse } from "next/server";
import invariant from "tiny-invariant";
import config from "../../../../lib/config";
import {
	getNumericSectionId,
	getSectionById,
	jsonError,
} from "../../../../lib/api-route";
import {
	getStoredMetaDirectoryKey,
	readStoredMetaDirectory,
} from "../../../../lib/file-meta";
import type {
	DailyLocationSummary,
	DatedFileEntry,
	StoredDirectoryMetaEntry,
} from "../../../../lib/files-types";
import { getFileDates } from "../../../../lib/files";

interface DatesSuccessResponse {
	sectionId: number;
	dates: Record<string, { count: number; locations: string[] }>;
	locationsByDate: Record<string, DailyLocationSummary[]>;
}

const maxLocationsPerDate = 3;

interface RouteContext {
	params: Promise<{
		slug?: string[];
	}>;
}

export async function GET(request: Request, { params }: RouteContext) {
	try {
		const { slug = [] } = await params;
		const [sectionInput, ...filePath] = slug;
		const url = new URL(request.url);
		const sectionId = getNumericSectionId(sectionInput, url.searchParams.get("section"));
		const section = getSectionById(config.sections, sectionId);
		invariant(section, "section");
		let files = (await getFileDates(section, filePath)) as DatedFileEntry[];

		files = files.filter((file) => !file.isDir);
		const locationsByDate = await getDateLocationSummaries(section, files);
		const dates = {} as Record<string, { count: number; locations: string[] }>;
		for (const file of files) {
			const dateKey = file.date.toISOString().substring(0, 10);
			if (!dates[dateKey]) {
				dates[dateKey] = { count: 0, locations: [] };
			}
			dates[dateKey].count += 1;
		}

		const sortedDateKeys = Object.keys(dates).sort();
		const sortedDates = sortedDateKeys
			.reduce<Record<string, { count: number; locations: string[] }>>((acc, key) => {
				acc[key] = {
					...dates[key],
					locations: (locationsByDate[key] ?? []).map((location) => location.label),
				};
				return acc;
			}, {});
		const sortedLocationsByDate = sortedDateKeys.reduce<
			Record<string, DailyLocationSummary[]>
		>((acc, key) => {
				acc[key] = locationsByDate[key] ?? [];
				return acc;
			}, {});

		return NextResponse.json<DatesSuccessResponse>(
			{ sectionId, dates: sortedDates, locationsByDate: sortedLocationsByDate },
			{
				headers: {
					"Cache-Control": "public, s-maxage=6000",
					Expires: DateTime.now().plus({ days: 30 }).toHTTP() ?? "",
				},
			},
		);
	} catch (error) {
		return NextResponse.json(jsonError(error), { status: 500 });
	}
}

async function getDateLocationSummaries(
	section: (typeof config.sections)[number],
	files: DatedFileEntry[],
): Promise<Record<string, DailyLocationSummary[]>> {
	const metaCache = new Map<string, Record<string, StoredDirectoryMetaEntry>>();
	const locationCountsByDate = new Map<
		string,
		Map<string, Omit<DailyLocationSummary, "count"> & { count: number }>
	>();

	for (const file of files) {
		const filePath = String(file.dirPath ?? file.path)
			.split("/")
			.filter(Boolean);
		const metaFile = getStoredMetaDirectoryKey(section, filePath);
		const metaData =
			metaCache.get(metaFile) ?? (await readStoredMetaDirectory(section, filePath));
		metaCache.set(metaFile, metaData);

		const fileMeta = metaData[pathBaseName(filePath)];
		const location = fileMeta?.location;
		if (!location?.label) {
			continue;
		}

		const dateKey = file.date.toISOString().substring(0, 10);
		const dailyCounts = locationCountsByDate.get(dateKey) ?? new Map();
		const existing = dailyCounts.get(location.label);
		dailyCounts.set(location.label, {
			label: location.label,
			locality: location.locality,
			countryIso2: location.countryIso2,
			countryName: location.countryName,
			count: (existing?.count ?? 0) + 1,
		});
		locationCountsByDate.set(dateKey, dailyCounts);
	}

	return Object.fromEntries(
		Array.from(locationCountsByDate.entries()).map(([dateKey, counts]) => [
			dateKey,
			Array.from(counts.values())
				.sort((first, second) => second.count - first.count || first.label.localeCompare(second.label))
				.slice(0, maxLocationsPerDate),
		]),
	);
}

function pathBaseName(filePath: string[]) {
	return filePath[filePath.length - 1] ?? "";
}
