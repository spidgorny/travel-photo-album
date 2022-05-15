import config from "../../../config.json";
import { getFileDates } from "../../../lib/files.mjs";
import { DateTime } from "luxon";

export default async function handler(req, res) {
  try {
    const [sectionInput, ...filePath] = req.query.slug;
    const sectionId = Number(sectionInput ?? req.query.section);
    const section = config.sections[sectionId];
    const files = await getFileDates(section, filePath);

    // unique dates
    let dates = files.reduce((dates, x) => {
      let dateKey = x.date.toISOString().substring(0, 10);
      return { ...dates, [dateKey]: (dates[dateKey] ?? 0) + 1 };
    }, {});

    dates = Object.keys(dates)
      .sort()
      .reduce((obj, key) => {
        obj[key] = dates[key];
        return obj;
      }, {});

    // console.table(dates);
    res.setHeader("Cache-Control", "public, s-maxage=6000");
    res.setHeader("Expires", DateTime.now().plus({ days: 30 }).toHTTP());
    res.status(200).json({ sectionId, dates });
  } catch (e) {
    res.status(500).json({
      status: "error",
      message: e.message,
      stack: e?.stack.split("\n"),
    });
  }
}
