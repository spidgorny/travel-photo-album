import sizeOf from "image-size";
import FfmpegCommand, { type FfprobeData } from "fluent-ffmpeg";
import { NextResponse } from "next/server";
import invariant from "tiny-invariant";
import config, { type ConfigSection } from "../../../../lib/config";
import {
	getSectionById,
	jsonError,
	toError,
} from "../../../../lib/api-route";
import { joinSectionPath } from "../../../../lib/files";
import {
	getStoredMetaDirectoryKeys,
	buildBasicFileMetaData,
	buildImageMetaData,
	normalizeStoredDescription,
	normalizeStoredPhash,
	readStoredMetaForFile,
	updateStoredDescriptionForFile,
} from "../../../../lib/file-meta";
import type { StoredDirectoryMetaEntry } from "../../../../lib/files-types";
import {
	serializeSectionForWorker,
	thumbJobActions,
	type ThumbImageMetaData,
} from "../../../../lib/thumb-jobs";
import { getMediaKind } from "../../../../lib/thumb-store";
import { ThumbQueue } from "../../../../lib/thumb-queue";

interface MetaComputedDimensions {
	Width?: number;
	Height?: number;
	width?: number;
	height?: number;
}

interface JsonMetaData extends StoredDirectoryMetaEntry {
	width: number;
	height: number;
}

interface FileMetaData {
	FileName: string;
	MimeType: string | false;
	FileSize: number;
	COMPUTED: {
		Width?: number;
		Height?: number;
	};
	dimensions: ReturnType<typeof sizeOf>;
}

interface Mp4PreviewMetaData {
	MimeType: "mp4";
	thumbnail: string;
	COMPUTED: {
		Width: number;
		Height: number;
	};
}

type VideoMetaData = FfprobeData & {
	COMPUTED: MetaComputedDimensions;
};

type MetaData = JsonMetaData | FileMetaData | Mp4PreviewMetaData | VideoMetaData;

type MetaErrorResponse = ReturnType<typeof jsonError> & {
	sectionId?: string;
	filePath?: string;
};

interface RouteContext {
	params: Promise<{
		path?: string[];
	}>;
}

export async function GET(_request: Request, { params }: RouteContext) {
	const { path: pathSegments = [] } = await params;
	const [sectionId, ...filePath] = pathSegments;

	try {
		const section = getSectionById(config.sections, sectionId);
		invariant(section, "section");
		const numericSectionId = Number(sectionId);
		const metaSearchKeys = getStoredMetaDirectoryKeys(section, filePath);
		const storedMeta = await readStoredMetaForFile(section, filePath);

		let metaData: MetaData | null = getMetaByJson(storedMeta);
		if (!metaData) {
			metaData = await getMetaByFile(numericSectionId, section, filePath);
		}

		return NextResponse.json(
			{
				...metaData,
				metaSearchKeys,
				storedMeta,
			},
			{
			headers: {
				"Cache-Control": "s-maxage=86400, public",
			},
			},
		);
	} catch (error) {
		const err = toError(error);
		if (err.message === "MP4 preview") {
			return NextResponse.json({
				MimeType: "mp4",
				thumbnail: "https://www.free-codecs.com/pictures/screenshots/mp4_splitter.jpg",
				COMPUTED: {
					Width: 3,
					Height: 2,
				},
				metaSearchKeys: [],
			});
		}

		return NextResponse.json(
			jsonError(err, {
				sectionId,
				filePath: filePath.join("/"),
			}) as MetaErrorResponse,
			{ status: 500 },
		);
	}
}

export async function PATCH(request: Request, { params }: RouteContext) {
	try {
		const { path: pathSegments = [] } = await params;
		const [sectionId, ...filePath] = pathSegments;
		const section = getSectionById(config.sections, sectionId);
		invariant(section, "section");

		const body = (await request.json()) as { description?: unknown };
		const description =
			typeof body.description === "string"
				? body.description
				: body.description == null
					? null
					: undefined;
		invariant(description !== undefined, "description must be a string or null");

		await updateStoredDescriptionForFile(section, filePath, description);
		const storedMeta = await readStoredMetaForFile(section, filePath);

		return NextResponse.json({
			ok: true,
			description: normalizeStoredDescription(storedMeta?.description) ?? null,
		});
	} catch (error) {
		return NextResponse.json(jsonError(error), { status: 500 });
	}
}

async function getMetaByFile(
	sectionId: number,
	section: ConfigSection,
	filePath: string[],
): Promise<FileMetaData | VideoMetaData> {
	const mediaKind = getMediaKind(filePath);
	if (mediaKind === "video") {
		return getVideoMeta(sectionId, section, filePath);
	}
	if (mediaKind !== "image") {
		return buildBasicFileMetaData(section, filePath) as FileMetaData;
	}
	const metaData = await buildImageMetaData(section, filePath);

	const queue = new ThumbQueue();
	await queue.enqueue({
		action: thumbJobActions.getMetaForFile,
		sectionId,
		section: serializeSectionForWorker(section),
		filePath,
		metaData,
	});

	return metaData as FileMetaData;
}

function getMetaByJson(fileMeta: StoredDirectoryMetaEntry | null): JsonMetaData | null {
	if (!fileMeta?.COMPUTED?.Width || !fileMeta?.COMPUTED?.Height) {
		return null;
	}
	return {
		...fileMeta,
		width: fileMeta.COMPUTED.Width,
		height: fileMeta.COMPUTED.Height,
		description: normalizeStoredDescription(fileMeta.description),
		phash: normalizeStoredPhash(fileMeta.phash),
	};
}

async function getVideoMeta(
	sectionId: number,
	section: ConfigSection,
	filePath: string[],
): Promise<VideoMetaData> {
	return new Promise((resolve, reject) => {
		invariant(section.path, "section.path");
		const fullPath = joinSectionPath(section.path, filePath);
		FfmpegCommand.ffprobe(fullPath, async (error, data) => {
			if (error) {
				reject(error);
				return;
			}

			const queue = new ThumbQueue();
			await queue.enqueue({
				action: thumbJobActions.storeMetaForVideo,
				sectionId,
				section: serializeSectionForWorker(section),
				filePath,
				data,
			});

			const videoStream = data.streams.find((stream) => stream.codec_type === "video");
			resolve({
				...data,
				COMPUTED: {
					width: videoStream?.width,
					height: videoStream?.height,
				},
			});
		});
	});
}
