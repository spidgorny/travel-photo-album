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
	buildBasicFileMetaData,
	buildImageMetaData,
	readStoredMetaForFile,
} from "../../../../lib/file-meta";
import type { StoredDirectoryMetaEntry } from "../../../../lib/files-types";
import {
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

		let metaData: MetaData | null = await getMetaByJson(section, filePath);
		if (!metaData) {
			metaData = await getMetaByFile(numericSectionId, section, filePath);
		}

		return NextResponse.json(metaData, {
			headers: {
				"Cache-Control": "s-maxage=86400, public",
			},
		});
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

async function getMetaByJson(
	section: ConfigSection,
	filePath: string[],
): Promise<JsonMetaData | null> {
	if (!section.thumbPath) {
		return readMetaFromStorage(section, filePath);
	}
	return readMetaFromStorage(section, filePath);
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
		filePath,
		metaData,
	});

	return metaData as FileMetaData;
}

function readMetaFromStorage(
	section: ConfigSection,
	filePath: string[],
): JsonMetaData | null {
	const fileMeta = readStoredMetaForFile(section, filePath);
	if (!fileMeta?.COMPUTED?.Width || !fileMeta?.COMPUTED?.Height) {
		return null;
	}
	return {
		...fileMeta,
		width: fileMeta.COMPUTED.Width,
		height: fileMeta.COMPUTED.Height,
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
