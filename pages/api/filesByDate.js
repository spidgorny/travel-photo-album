import { getFilesForSection } from "./dates.js";
import invariant from "tiny-invariant";

export default async function handler(req, res) {
  try {
    const sectionId = Number(req.query.section);
    const date = new Date(req.query.date);
    invariant(date);
    let files = await getFilesForSection(sectionId);
    const datePlus1 = new Date(date.getTime() + 1000 * 60 * 60 * 24);
    console.log(date, datePlus1);
    files = files.filter((x) => x.date > date && x.date < datePlus1);

    console.log({ files });
    res.setHeader("Cache-Control", "s-maxage=6000");
    res.status(200).json({ sectionId, files });
  } catch (e) {
    res
      .status(500)
      .json({ status: "error", message: e.message, stack: e.stack });
  }
}
