import { DateTime } from "luxon";
import { NextResponse } from "next/server";
import invariant from "tiny-invariant";
import config from "../../../../lib/config";
import {
	getNumericSectionId,
	getSectionById,
	jsonError,
} from "../../../../lib/api-route";
import type { DatedFileEntry } from "../../../../lib/files-types";
import { getFileDates } from "../../../../lib/files";

interface DatesSuccessResponse {
	sectionId: number;
	dates: Record<string, number>;
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
		const sectionId = getNumericSectionId(sectionInput, url.searchParams.get("section"));
		const section = getSectionById(config.sections, sectionId);
		invariant(section, "section");
		let files = (await getFileDates(section, filePath)) as DatedFileEntry[];

		files = files.filter((file) => !file.isDir);

		const dates = files.reduce<Record<string, number>>((acc, file) => {
			const dateKey = file.date.toISOString().substring(0, 10);
			return { ...acc, [dateKey]: (acc[dateKey] ?? 0) + 1 };
		}, {});

		const sortedDates = Object.keys(dates)
			.sort()
			.reduce<Record<string, number>>((acc, key) => {
				acc[key] = dates[key];
				return acc;
			}, {});

		return NextResponse.json<DatesSuccessResponse>(
			{ sectionId, dates: sortedDates },
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
