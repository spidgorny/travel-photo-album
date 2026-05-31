import crypto from "crypto";
import fs from "fs";
import { Readable } from "stream";
import invariant from "tiny-invariant";
import config from "../../../../lib/config";
import { DescriptionQueue } from "../../../../lib/description-queue";
import {
	descriptionJobActions,
	isDescriptionQueueConfigured,
} from "../../../../lib/description-jobs";
import {
	normalizeStoredDescription,
	readStoredMetaForFile,
} from "../../../../lib/file-meta";
import {
	serializeSectionForWorker,
	thumbJobActions,
} from "../../../../lib/thumb-jobs";
import { ThumbQueue } from "../../../../lib/thumb-queue";
import {
	ensureSectionThumb,
	defaultVideoThumbnailFrameIndex,
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
		const frameIndex = normalizeFrameIndex(requestUrl.searchParams.get("frame"));
		const { path: pathSegments = [] } = await params;
		const [sectionId, ...filePath] = pathSegments;
		const section = getSectionById(config.sections, sectionId);
		invariant(section, "section");
		invariant(section.path, "section.path");
		const mediaKind = getMediaKind(filePath);
		if (mediaKind === "unsupported") {
			return Response.json(jsonError(new Error("unsupported media type")), {
				status: 415,
			});
		}

		const numericSectionId = Number(sectionId);
		const shouldWarmMetadata = mediaKind === "image";
		const [thumb, storedMeta] = await Promise.all([
			ensureSectionThumb(
				numericSectionId,
				section,
				filePath,
				variant,
				frameIndex,
			),
			shouldWarmMetadata ? readStoredMetaForFile(section, filePath) : Promise.resolve(null),
		]);
		const missingDescription =
			shouldWarmMetadata &&
			isDescriptionQueueConfigured() &&
			!normalizeStoredDescription(storedMeta?.description);
		if (shouldWarmMetadata && !storedMeta) {
			const queue = new ThumbQueue();
			await queue.enqueue({
				action: thumbJobActions.warmSectionFile,
				sectionId: numericSectionId,
				section: serializeSectionForWorker(section),
				filePath,
				variant,
			});
		} else if (missingDescription) {
			const descriptionQueue = new DescriptionQueue();
			await descriptionQueue.enqueue({
				action: descriptionJobActions.generateImageDescription,
				sectionId: numericSectionId,
				section: serializeSectionForWorker(section),
				filePath,
				variant,
			});
		}

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

function normalizeFrameIndex(value: string | null) {
	if (value === null) {
		return defaultVideoThumbnailFrameIndex;
	}
	const parsed = Number(value);
	return Number.isInteger(parsed) ? parsed : defaultVideoThumbnailFrameIndex;
}
