import invariant from "tiny-invariant";
import { isValidDate } from "../../../lib/date.mjs";
import { DateTime } from "luxon";
import config from "../../../config.json";
import { getFileDates } from "../../../lib/files.mjs";
import path from "path";

export default async function handler(req, res) {
  try {
    let [sectionInput, date, ...filePath] = req.query.slug;
    const sectionId = Number(sectionInput ?? req.query.section);
    const section = config.sections[sectionId];
    invariant(section);

    date = new Date(date);
    invariant(isValidDate(date), "date missing");
    const datePlus1 = new Date(date.getTime() + 1000 * 60 * 60 * 24);
    console.log([date, datePlus1]);

    let files = await getFileDates(section, filePath ?? []);
    files = files.filter((x) => x.date > date && x.date < datePlus1);

    // console.log({ files });
    res.setHeader("Cache-Control", "public, s-maxage=6000");
    res.setHeader("Expires", DateTime.now().plus({ days: 30 }).toHTTP());
    res.status(200).json({ sectionId, section, files });
  } catch (e) {
    res.status(500).json({
      status: "error",
      message: e.message,
      stack: e?.stack.split("\n"),
    });
  }
}