import crypto from "crypto";
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
		const etag =
			"buffer" in thumb
				? `"${crypto.createHash("sha1").update(thumb.buffer).digest("hex")}"`
				: createStatEtag(fs.statSync(thumb.path));
		if (_request.headers.get("if-none-match") === etag) {
			return new Response(null, {
				status: 304,
				headers: {
					"Cache-Control": "public, max-age=31536000, immutable, s-maxage=31536000",
					ETag: etag,
					"X-Thumb": thumb.source,
				},
			});
		}

		return new Response(Readable.toWeb(stream) as ReadableStream, {
			status: 200,
			headers: {
				"Content-Type": thumb.mimeType,
				"Cache-Control": "public, max-age=31536000, immutable, s-maxage=31536000",
				ETag: etag,
				"X-Thumb": thumb.source,
			},
		});
	} catch (error) {
		return Response.json(jsonError(error), { status: 500 });
	}
}

function createStatEtag(stat: fs.Stats) {
	return `"${stat.size}-${Math.trunc(stat.mtimeMs)}"`;
}
