import { DateTime } from "luxon";
import { NextResponse } from "next/server";
import invariant from "tiny-invariant";
import config, { type ConfigSection } from "../../../../lib/config/config";
import {
	getSectionById,
	getSectionIndex,
	jsonError,
} from "../../../../lib/api/api-route";
import type { FilteredFileEntry } from "../../../../lib/media/files-types";
import { getFilteredFiles } from "../../../../lib/media/files";

interface FilesSuccessResponse {
	sectionInput?: string;
	sectionId: number;
	section: ConfigSection;
	files: FilteredFileEntry[];
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
		const files = (await getFilteredFiles(section, filePath)) as FilteredFileEntry[];

		return NextResponse.json<FilesSuccessResponse>(
			{ sectionInput, sectionId, section, files },
			{
				headers: {
					"Cache-Control": "public, s-maxage=6000",
					Expires: DateTime.now().plus({ days: 30 }).toHTTP() ?? "",
					ETag: filePath.join("/"),
				},
			},
		);
	} catch (error) {
		return NextResponse.json(jsonError(error), { status: 500 });
	}
}
