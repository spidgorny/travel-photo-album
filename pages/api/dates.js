import config from "../../config.json";
import readdir from "recursive-readdir";
import path from "path";
import fs from "fs";

export default async function handler(req, res) {
  try {
    const sectionId = Number(req.query.section);
    const files = await getFilesForSection(sectionId);
    // console.table(files);
    // console.log({files});
    const dates = files.reduce(
      (dates, x) =>
        dates.includes(x.date.toISOString().substring(0, 10))
          ? dates
          : [...dates, x.date.toISOString().substring(0, 10)],
      []
    );
    dates.sort();
    // console.table(dates);
    res.setHeader("Cache-Control", "s-maxage=6000");
    res.status(200).json({ sectionId, dates });
  } catch (e) {
    res
      .status(500)
      .json({ status: "error", message: e.message, stack: e.stack });
  }
}

export async function getFilesForSection(sectionId) {
  const section = config.sections[sectionId];
  let imagePath = section.path;
  if (process.platform === "win32") {
    imagePath = imagePath.replace(
      "/media/nas/photo/",
      "//192.168.1.189/photo/"
    );
  }
  console.log("readdir", imagePath);
  let files = await readdir(imagePath);

  if (section.from) {
    const iFrom = files.findIndex((x) => path.basename(x) === section.from);
    console.log({ iFrom });
    if (iFrom >= 0) {
      files = files.slice(iFrom);
    }
  }
  if (section.till) {
    const iTill = files.findIndex((x) => path.basename(x) === section.till);
    console.log({ iTill });
    if (iTill >= 0) {
      files = files.slice(0, iTill + 1);
    }
  }

  files = files.map((x) => ({
    path: x,
    date: getFileDate(x),
  }));
  return files;
}

function getFileDate(pathName) {
  const fileName = path.basename(pathName);
  const match = fileName.match(/(20\d\d)(\d\d)(\d\d)/);
  if (!match) {
    return fs.statSync(pathName).mtime;
  }
  let date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  // console.log(fileName, date.toISOString());
  return date;
}
