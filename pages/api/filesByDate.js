import { getFilesForSection } from "./dates.js";
import invariant from "tiny-invariant";
import { isValidDate } from "../../lib/date.mjs";

export default async function handler(req, res) {
  try {
    const sectionId = Number(req.query.section);
    const date = new Date(req.query.date);
    invariant(isValidDate(date), "date missing");
    const datePlus1 = new Date(date.getTime() + 1000 * 60 * 60 * 24);
    console.log([date, datePlus1]);

    let files = await getFilesForSection(sectionId);
    files = files.filter((x) => x.date > date && x.date < datePlus1);

    // console.log({ files });
    res.setHeader("Cache-Control", "s-maxage=6000");
    res.status(200).json({ sectionId, files });
  } catch (e) {
    res
      .status(500)
      .json({ status: "error", message: e.message, stack: e.stack });
  }
}
