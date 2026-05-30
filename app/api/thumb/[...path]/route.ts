import fs from "fs";
import { Readable } from "stream";
import invariant from "tiny-invariant";
import config from "../../../../lib/config";
import {
	ensureSectionThumb,
	getMediaKind,
} from "../../../../lib/thumb-store";
import {
	getSectionById,
	jsonError,
} from "../../../../lib/api-route";
interface RouteContext {
	params: Promise<{
		path?: string[];
	}>;
}

export async function GET(_request: Request, { params }: RouteContext) {
	try {
		const requestUrl = new URL(_request.url);
		const variant = requestUrl.searchParams.get("variant") || undefined;
		const { path: pathSegments = [] } = await params;
		const [sectionId, ...filePath] = pathSegments;
		const section = getSectionById(config.sections, sectionId);
		invariant(section, "section");
		invariant(section.path, "section.path");
		if (getMediaKind(filePath) === "unsupported") {
			return Response.json(jsonError(new Error("unsupported media type")), {
				status: 415,
			});
		}

		const thumb = await ensureSectionThumb(
			Number(sectionId),
			section,
			filePath,
			variant,
		);
		const stream =
			"buffer" in thumb
				? Readable.from(thumb.buffer)
				: fs.createReadStream(thumb.path);

		return new Response(Readable.toWeb(stream) as ReadableStream, {
			status: 200,
			headers: {
				"Content-Type": thumb.mimeType,
				"Cache-Control": "s-maxage=86400, public",
				"X-Thumb": thumb.source,
			},
		});
	} catch (error) {
		return Response.json(jsonError(error), { status: 500 });
	}
}
