import fs from "fs";
import { Readable } from "stream";
import mime from "mime-types";
import invariant from "tiny-invariant";
import config, { type ConfigSection } from "../../../../lib/config";
import {
	getSectionById,
	jsonError,
} from "../../../../lib/api-route";
import { joinSectionPath } from "../../../../lib/files";

interface PhotoErrorResponse {
	sectionId?: string;
	section?: ConfigSection;
	fullPath?: string;
	status: "error";
	message: string;
	stack?: string[];
}

interface RouteContext {
	params: Promise<{
		path?: string[];
	}>;
}

export async function GET(_request: Request, { params }: RouteContext) {
	const { path: pathSegments = [] } = await params;
	const [sectionId, ...filePath] = pathSegments;
	const section = getSectionById(config.sections, sectionId);
	let fullPath: string | undefined;

	try {
		invariant(section, "section");
		invariant(section.path, "section.path");
		fullPath = joinSectionPath(section.path, filePath);
		if (fullPath.toLowerCase().endsWith("mp4")) {
			throw new Error("MP4 preview");
		}
		const mimeType = mime.lookup(fullPath) || "application/octet-stream";
		const stat = fs.statSync(fullPath);
		const etag = createStatEtag(stat);
		if (_request.headers.get("if-none-match") === etag) {
			return new Response(null, {
				status: 304,
				headers: {
					"Cache-Control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
					ETag: etag,
				},
			});
		}
		const stream = fs.createReadStream(fullPath);

		return new Response(Readable.toWeb(stream) as ReadableStream, {
			status: 200,
			headers: {
				"Content-Type": mimeType,
				"Cache-Control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
				ETag: etag,
			},
		});
	} catch (error) {
		return Response.json(
			jsonError(error, {
				sectionId,
				section,
				fullPath,
			}) as PhotoErrorResponse,
			{ status: 500 },
		);
	}
}

function createStatEtag(stat: fs.Stats) {
	return `"${stat.size}-${Math.trunc(stat.mtimeMs)}"`;
}
