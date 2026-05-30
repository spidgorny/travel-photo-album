import type { NextApiHandler } from "next";
import { DateTime } from "luxon";
import invariant from "tiny-invariant";
import config, { type ConfigSection } from "../../../lib/config";
import {
getCatchAllSegments,
getNumericSectionId,
getSectionById,
jsonError,
} from "../../../lib/api-route";
import type { FilteredFileEntry } from "../../../lib/files-types";
import { getFilteredFiles } from "../../../lib/files";

interface FilesSuccessResponse {
sectionInput?: string;
sectionId: number;
section: ConfigSection;
files: FilteredFileEntry[];
}

type FilesErrorResponse = ReturnType<typeof jsonError>;

const handler: NextApiHandler<FilesSuccessResponse | FilesErrorResponse> = async (
req,
res,
) => {
try {
const [sectionInput, ...filePath] = getCatchAllSegments(req.query.slug);
const sectionId = getNumericSectionId(sectionInput, req.query.section);
const section = getSectionById(config.sections, sectionId);
invariant(section, "section");
const files = (await getFilteredFiles(
	section,
	filePath,
)) as FilteredFileEntry[];
res.setHeader("Cache-Control", "public, s-maxage=6000");
res.setHeader("Expires", DateTime.now().plus({ days: 30 }).toHTTP());
res.setHeader("ETag", filePath.join("/"));
res.status(200).json({ sectionInput, sectionId, section, files });
} catch (error) {
console.error(error);
res.status(500).json(jsonError(error));
}
};

export default handler;
