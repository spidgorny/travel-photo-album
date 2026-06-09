import { NextResponse } from "next/server";
import config from "../../../../lib/config";
import { getSectionById, getSectionIndex, jsonError } from "../../../../lib/api-route";
import { readStoredMetaForFile } from "../../../../lib/file-meta";
import { getFilteredFiles } from "../../../../lib/files";
import {
	getMediaKind,
	getStoredThumbMetaEntry,
	hasStoredSectionThumb,
	thumbnailTargetWidth,
} from "../../../../lib/thumb-store";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ slug?: string[] }> }) {
	try {
		const resolvedParams = await params;
		const { slug = [] } = resolvedParams;
		const [sectionInput, ...filePath] = slug;
		const section = getSectionById(config.sections, sectionInput);
		if (!section) {
			return NextResponse.json({ error: `section ${sectionInput} not found` }, { status: 404 });
		}
		const sectionId = getSectionIndex(config.sections, section);

		const folderPath = Array.isArray(filePath) ? filePath : [];
		const entries = await getFilteredFiles(section, folderPath) ?? [];
		const files = entries.filter((entry) => !entry.isDir);
		const variant = `w${thumbnailTargetWidth}-jpeg`;

		const counts = {
			originalFiles: 0,
			imageFiles: 0,
			videoFiles: 0,
			unsupportedFiles: 0,
			thumbnails: 0,
			metadataEntries: 0,
			exifEntries: 0,
			dominantColors: 0,
			kvThumbEntries: 0,
			kvMetaEntries: 0,
		};

		await Promise.all(
			files.map(async (entry) => {
				const relativePath = [...folderPath, entry.path];
				const mediaKind = getMediaKind(relativePath);
				if (mediaKind === "unsupported") {
					counts.unsupportedFiles += 1;
					return;
				}

				counts.originalFiles += 1;
				if (mediaKind === "image") {
					counts.imageFiles += 1;
				} else if (mediaKind === "video") {
					counts.videoFiles += 1;
				}

				const [hasThumb, metaEntry, kvThumbMeta] = await Promise.all([
					hasStoredSectionThumb(section, relativePath, variant),
					readStoredMetaForFile(section, relativePath),
					section.thumbPath ? null : getStoredThumbMetaEntry(section.name, relativePath, variant),
				]);

				if (hasThumb) {
					counts.thumbnails += 1;
				}
				if (metaEntry) {
					counts.metadataEntries += 1;
					counts.exifEntries += 1;
					if (!section.thumbPath) {
						counts.kvMetaEntries += 1;
					}
				}
				if (kvThumbMeta) {
					counts.kvThumbEntries += 1;
					if (kvThumbMeta.dominantColor) {
						counts.dominantColors += 1;
					}
				}
			}),
		);

		return NextResponse.json({
			sectionId,
			collection: section.name,
			folder: folderPath.join("/"),
			storageMode: section.thumbPath ? "disk" : "kv",
			counts,
			updatedAt: new Date().toISOString(),
		});
	} catch (error) {
		return NextResponse.json(jsonError(error), { status: 500 });
	}
}
