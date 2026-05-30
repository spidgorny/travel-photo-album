import { DateTime } from "luxon";
import { NextResponse } from "next/server";
import invariant from "tiny-invariant";
import config from "../../../../lib/config";
import { isValidDate } from "../../../../lib/date";
import { getFileDates } from "../../../../lib/files";
import { getImageDimensions } from "../../../../lib/thumb-store";

interface RouteContext {
	params: Promise<{
		slug?: string[];
	}>;
}

export async function GET(_request: Request, { params }: RouteContext) {
	try {
		const { slug = [] } = await params;
		const [sectionInput, ...filePathWithDate] = slug;
		const dateInput = filePathWithDate.pop();
		const sectionId = Number(sectionInput);
		const section = config.sections?.[sectionId];
		invariant(section, "section");
		invariant(dateInput, "date missing");

		const date = new Date(dateInput);
		invariant(isValidDate(date), "date missing");
		const datePlus1 = new Date(date.getTime() + 1000 * 60 * 60 * 24);

		let files = await getFileDates(section, filePathWithDate);
		files = files.filter((file) => file.date > date && file.date < datePlus1);
		files = files.filter((file) => !file.isDir);
		files = await Promise.all(
			files.map(async (file) => {
				const filePath = String(file.dirPath ?? file.path)
					.split("/")
					.filter(Boolean);
				const dimensions = await getImageDimensions(sectionId, section, filePath);
				return {
					...file,
					width: dimensions.width,
					height: dimensions.height,
					dominantColor: dimensions.dominantColor,
					original: {
						width: dimensions.width,
						height: dimensions.height,
					},
				};
			}),
		);

		return NextResponse.json(
			{ sectionId, section, files },
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
