import config from "../../../config.json";
// import readdir from "recursive-readdir";
import path from "path";
import { globby } from "globby";
import invariant from "tiny-invariant";
import readdir from "@jsdevtools/readdir-enhanced";
import { DateTime } from "luxon";

export default async function handler(req, res) {
  try {
    const [sectionInput, ...filePath] = req.query.slug;
    const sectionId = Number(sectionInput ?? req.query.section);
    const section = config.sections[sectionId];
    invariant(section);
    let imagePath = path.posix.join(section.path, ...filePath);
    if (process.platform === "win32") {
      imagePath = imagePath.replace(
        "/media/nas/photo/",
        "//192.168.1.189/photo/"
      );
    }
    console.log("reading", imagePath);
    let files = await getFiles(imagePath);

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
    // console.log({ files });
    res.setHeader("Cache-Control", "public, s-maxage=6000");
    res.setHeader("Expires", DateTime.now().plus({ days: 30 }).toHTTP());
    res.setHeader("ETag", filePath.join("/"));
    res
      .status(200)
      .json({ sectionInput, sectionId, section, imagePath, files });
  } catch (e) {
    console.error(e);
    res
      .status(500)
      .json({ status: "error", message: e.message, stack: e.stack });
  }
}
import cache from "memory-cache";
import crypto from "crypto";

const myCache = new cache.Cache();

// will hash the vars
export async function magicCache(code, slowCode, ...vars) {
  const shasum = crypto.createHash("sha1");
  const hash = shasum.update(JSON.stringify(vars)).digest("hex");
  let value = myCache.get(hash);
  if (value) {
    console.warn("magic-cache", "HIT", hash);
    return value;
  }

  // console.log('magic', vars)
  value = await slowCode(...vars);
  myCache.put(hash, value);
  return value;
}

async function getFiles(imagePath) {
  // this is recursive and slow
  // let files = await readdir(imagePath);

  // this returns nothing []
  // let patterns = path.join(imagePath, "*");
  // console.log(patterns);
  // let files = await globby(patterns, {
  //   expandDirectories: true,
  // });
  // return files;

  return magicCache("getFiles", () => readdir.async(imagePath), imagePath);
}
