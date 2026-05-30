import type { NextApiHandler } from "next";
import fs from "fs";
import mime from "mime-types";
import invariant from "tiny-invariant";
import config, { type ConfigSection } from "../../../lib/config";
import {
getCatchAllSegments,
getSectionById,
jsonError,
} from "../../../lib/api-route";
import { joinSectionPath } from "../../../lib/files";

interface PhotoErrorResponse {
sectionId?: string;
section?: ConfigSection;
fullPath?: string;
status: "error";
message: string;
stack?: string[];
}

const handler: NextApiHandler<PhotoErrorResponse> = async (req, res) => {
const [sectionId, ...filePath] = getCatchAllSegments(req.query.path);
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
res.setHeader("Content-Type", mimeType);
res.setHeader("Cache-Control", "s-maxage=86400, public");
const stream = fs.createReadStream(fullPath);
res.status(200);
stream.pipe(res);
} catch (error) {
res.status(500).json(
jsonError(error, {
sectionId,
section,
fullPath,
}) as PhotoErrorResponse,
);
}
};

export default handler;
