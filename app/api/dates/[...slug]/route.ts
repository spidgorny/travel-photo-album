import { DateTime } from "luxon";
import { NextResponse } from "next/server";
import invariant from "tiny-invariant";
import config from "../../../../lib/config";
import {
	getSectionById,
	getSectionIndex,
	jsonError,
} from "../../../../lib/api-route";
import {
	getStoredMetaDirectoryKey,
	readStoredMetaDirectory,
} from "../../../../lib/file-meta";
import type {
	DailyLocationSummary,
	DatedFileEntry,
	FileEntryWithOptionalDate,
	StoredDirectoryMetaEntry,
} from "../../../../lib/files-types";
import { formatDayKey, getFilesWithOptionalDates } from "../../../../lib/files";
import {
	filterFilesBySearchQuery,
	normalizeSearchQuery,
} from "../../../../lib/search";

interface DatesSuccessResponse {
	sectionId: number;
	dates: Record<string, { count: number; locations: string[] }>;
	undated?: { count: number; locations: string[] };
	locationsByDate: Record<string, DailyLocationSummary[]>;
	pagination: {
		page: number;
		totalPages: number;
		totalFiles: number;
		totalDays: number;
		pageFiles: number;
		pageDays: number;
		perPageFileLimit: number;
		hasPreviousPage: boolean;
		hasNextPage: boolean;
	};
}

const maxLocationsPerDate = 3;
const galleryPageFileLimit = 1000;

interface DateBucket {
	dateKey: string;
	files: DatedFileEntry[];
	count: number;
}

interface DatePage {
	dateKeys: string[];
	files: DatedFileEntry[];
	fileCount: number;
}

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
		const section = getSectionById(config.sections, sectionInput ?? url.searchParams.get("section") ?? undefined);
		invariant(section, "section");
		const sectionId = getSectionIndex(config.sections, section);
		const indexedSection = { ...section, id: sectionId };
		const searchQuery = normalizeSearchQuery(url.searchParams.get("q"));
		let files = (await getFilesWithOptionalDates(indexedSection, filePath, { kvOnly: true })) as FileEntryWithOptionalDate[] | null;

		if (!files) {
			return NextResponse.json<DatesSuccessResponse>({
				sectionId,
				dates: {},
				locationsByDate: {},
				pagination: {
					page: 1,
					totalPages: 0,
					totalFiles: 0,
					totalDays: 0,
					pageFiles: 0,
					pageDays: 0,
					perPageFileLimit: galleryPageFileLimit,
					hasPreviousPage: false,
					hasNextPage: false,
				},
			}, {
				headers: {
					"X-Not-Indexed": "true",
					"Cache-Control": "no-store",
				},
			});
		}

		files = files.filter((file) => !file.isDir);
		if (searchQuery) {
			files = await filterFilesBySearchQuery(indexedSection, files, searchQuery);
		}
		const datedFiles = files.filter((file): file is DatedFileEntry => Boolean(file.date));
		const undatedFiles = files.filter((file) => !file.date);
		const dateBuckets = groupFilesByDate(datedFiles);
		const dateBucketByKey = new Map(dateBuckets.map((dateBucket) => [dateBucket.dateKey, dateBucket]));
		const pages = paginateDateBuckets(dateBuckets);
		const totalPages = Math.max(pages.length, 1);
		const requestedPage = normalizePageNumber(url.searchParams.get("page"));
		const page = Math.min(requestedPage, totalPages);
		const selectedPage = pages[page - 1] ?? { dateKeys: [], files: [], fileCount: 0 };
		const locationsByDate = await getDateLocationSummaries(indexedSection, selectedPage.files);
		const dates = selectedPage.dateKeys.reduce<
			Record<string, { count: number; locations: string[] }>
		>((acc, key) => {
			const dateBucket = dateBucketByKey.get(key);
			acc[key] = {
				count: dateBucket?.count ?? 0,
				locations: (locationsByDate[key] ?? []).map((location) => location.label),
			};
			return acc;
		}, {});
		const sortedLocationsByDate = selectedPage.dateKeys.reduce<
			Record<string, DailyLocationSummary[]>
		>((acc, key) => {
			acc[key] = locationsByDate[key] ?? [];
			return acc;
		}, {});

		return NextResponse.json<DatesSuccessResponse>(
			{
				sectionId,
				dates,
				undated: undatedFiles.length ? { count: undatedFiles.length, locations: [] } : undefined,
				locationsByDate: sortedLocationsByDate,
				pagination: {
					page,
					totalPages,
					totalFiles: files.length,
					totalDays: dateBuckets.length,
					pageFiles: selectedPage.fileCount + undatedFiles.length,
					pageDays: selectedPage.dateKeys.length,
					perPageFileLimit: galleryPageFileLimit,
					hasPreviousPage: page > 1,
					hasNextPage: page < totalPages,
				},
			},
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

function groupFilesByDate(files: DatedFileEntry[]): DateBucket[] {
	const filesByDate = new Map<string, DatedFileEntry[]>();

	for (const file of files) {
		const dateKey = formatDayKey(file.date);
		const existingFiles = filesByDate.get(dateKey) ?? [];
		existingFiles.push(file);
		filesByDate.set(dateKey, existingFiles);
	}

	return Array.from(filesByDate.entries())
		.sort(([firstDate], [secondDate]) => secondDate.localeCompare(firstDate))
		.map(([dateKey, datedFiles]) => ({
			dateKey,
			files: datedFiles,
			count: datedFiles.length,
		}));
}

function paginateDateBuckets(dateBuckets: DateBucket[]) {
	const pages: DatePage[] = [];
	let currentPage: DatePage = { dateKeys: [], files: [], fileCount: 0 };

	for (const dateBucket of dateBuckets) {
		if (
			currentPage.dateKeys.length > 0 &&
			currentPage.fileCount + dateBucket.count > galleryPageFileLimit
		) {
			pages.push(currentPage);
			currentPage = { dateKeys: [], files: [], fileCount: 0 };
		}

		currentPage.dateKeys.push(dateBucket.dateKey);
		currentPage.files.push(...dateBucket.files);
		currentPage.fileCount += dateBucket.count;
	}

	if (currentPage.dateKeys.length > 0) {
		pages.push(currentPage);
	}

	return pages;
}

function normalizePageNumber(pageInput: string | null) {
	const page = Number.parseInt(pageInput ?? "", 10);
	return Number.isInteger(page) && page > 0 ? page : 1;
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

		const dateKey = formatDayKey(file.date);
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
