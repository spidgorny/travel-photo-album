import fs from "fs";
import path from "path";
import sizeOf from "image-size";
import mime from "mime-types";
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
import { ThumbQueue } from "../../../../lib/thumb-queue";

interface MetaComputedDimensions {
	Width?: number;
	Height?: number;
	width?: number;
	height?: number;
}

interface JsonDirectoryMetaEntry extends Record<string, unknown> {
	COMPUTED: {
		Width: number;
		Height: number;
	};
}

interface JsonMetaData extends JsonDirectoryMetaEntry {
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

		let metaData: MetaData | null = await getMetaByJson(section, filePath);
		if (!metaData) {
			metaData = await getMetaByFile(section, filePath);
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
		return null;
	}
	const fullPath = joinSectionPath(section.thumbPath, filePath);
	const metaFile = path.posix.join(path.dirname(fullPath), "meta.json");

	try {
		fs.accessSync(metaFile, fs.constants.F_OK);
		const dirMeta = JSON.parse(
			fs.readFileSync(metaFile, "utf8"),
		) as Record<string, JsonDirectoryMetaEntry>;
		const fileBaseName = path.basename(fullPath);
		const fileMeta = dirMeta[fileBaseName];
		if (!fileMeta) {
			return null;
		}
		return {
			...fileMeta,
			width: fileMeta.COMPUTED.Width,
			height: fileMeta.COMPUTED.Height,
		};
	} catch {
		return null;
	}
}

async function getMetaByFile(
	section: ConfigSection,
	filePath: string[],
): Promise<FileMetaData | VideoMetaData> {
	if (isVideo(filePath.join("/"))) {
		return getVideoMeta(section, filePath);
	}
	invariant(section.path, "section.path");
	const fullPath = joinSectionPath(section.path, filePath);
	const mimeType = mime.lookup(fullPath);
	const dimensions = sizeOf(fs.readFileSync(fullPath));

	const metaData: FileMetaData = {
		FileName: path.basename(fullPath),
		MimeType: mimeType,
		FileSize: fs.statSync(fullPath).size,
		COMPUTED: {
			Width: dimensions.width,
			Height: dimensions.height,
		},
		dimensions,
	};

	const queue = new ThumbQueue();
	await queue.enqueue({
		action: "get-meta-for-file",
		section,
		filePath,
		metaData,
	});

	return metaData;
}

function isVideo(fullPath: string): boolean {
	return fullPath.toLowerCase().endsWith("mp4");
}

async function getVideoMeta(
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
				action: "store-meta-for-video",
				section,
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
