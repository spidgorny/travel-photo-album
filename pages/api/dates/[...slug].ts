import type { NextApiHandler } from "next";
import { DateTime } from "luxon";
import invariant from "tiny-invariant";
import config from "../../../lib/config";
import {
getCatchAllSegments,
getNumericSectionId,
getSectionById,
jsonError,
} from "../../../lib/api-route";
import type { DatedFileEntry } from "../../../lib/files-types";
import { getFileDates } from "../../../lib/files";

interface DatesSuccessResponse {
sectionId: number;
dates: Record<string, number>;
}

type DatesErrorResponse = ReturnType<typeof jsonError>;

const handler: NextApiHandler<DatesSuccessResponse | DatesErrorResponse> = async (
req,
res,
) => {
try {
const [sectionInput, ...filePath] = getCatchAllSegments(req.query.slug);
const sectionId = getNumericSectionId(sectionInput, req.query.section);
const section = getSectionById(config.sections, sectionId);
invariant(section, "section");
let files = (await getFileDates(section, filePath)) as DatedFileEntry[];

files = files.filter((file) => !file.isDir);

const dates = files.reduce<Record<string, number>>((acc, file) => {
const dateKey = file.date.toISOString().substring(0, 10);
return { ...acc, [dateKey]: (acc[dateKey] ?? 0) + 1 };
}, {});

const sortedDates = Object.keys(dates)
.sort()
.reduce<Record<string, number>>((acc, key) => {
acc[key] = dates[key];
return acc;
}, {});

res.setHeader("Cache-Control", "public, s-maxage=6000");
res.setHeader("Expires", DateTime.now().plus({ days: 30 }).toHTTP());
res.status(200).json({ sectionId, dates: sortedDates });
} catch (error) {
res.status(500).json(jsonError(error));
}
};

export default handler;
