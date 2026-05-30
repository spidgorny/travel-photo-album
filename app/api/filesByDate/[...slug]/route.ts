import { DateTime } from "luxon";
import { NextResponse } from "next/server";
import invariant from "tiny-invariant";
import config from "../../../../lib/config";
import { isValidDate } from "../../../../lib/date";
import { readStoredMetaForFile } from "../../../../lib/file-meta";
import { formatDayKey, getFileDates, parseDayKey } from "../../../../lib/files";
import { getImageDimensions } from "../../../../lib/thumb-store";

interface RouteContext {
	params: Promise<{
		slug?: string[];
	}>;
}

export async function GET(request: Request, { params }: RouteContext) {
	try {
		const { slug = [] } = await params;
		const [sectionInput, ...filePathWithDate] = slug;
		const url = new URL(request.url);
		const dateInput = filePathWithDate.pop();
		const sectionId = Number(sectionInput);
		const section = config.sections?.[sectionId];
		invariant(section, "section");
		invariant(dateInput, "date missing");

		const date = new Date(dateInput);
		invariant(isValidDate(date), "date missing");
		const dayKey = parseDayKey(dateInput);
		invariant(dayKey, "date missing");
		const searchQuery = normalizeSearchQuery(url.searchParams.get("q"));

		let files = await getFileDates(section, filePathWithDate);
		files = files.filter((file) => file.date && formatDayKey(file.date) === dayKey);
		files = files.filter((file) => !file.isDir);
		let responseFiles = await Promise.all(
			files.map(async (file) => {
				const filePath = String(file.dirPath ?? file.path)
					.split("/")
					.filter(Boolean);
				const [dimensions, storedMeta] = await Promise.all([
					getImageDimensions(sectionId, section, filePath),
					readStoredMetaForFile(section, filePath),
				]);
				return {
					...file,
					width: dimensions.width,
					height: dimensions.height,
					dominantColor: dimensions.dominantColor,
					description: normalizeDescription(storedMeta?.description),
					original: {
						width: dimensions.width,
						height: dimensions.height,
					},
				};
			}),
		);
		if (searchQuery) {
			responseFiles = responseFiles.filter((file) =>
				normalizeDescription(file.description)?.toLocaleLowerCase().includes(searchQuery),
			);
		}

		return NextResponse.json(
			{ sectionId, section, files: responseFiles },
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

function normalizeDescription(value: unknown) {
	if (typeof value !== "string") {
		return undefined;
	}
	const normalized = value.trim();
	return normalized.length ? normalized : undefined;
}
