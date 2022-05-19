import path from "path";
import readdir from "@jsdevtools/readdir-enhanced";
import fs from "fs";
import { magicCache } from "./cache.mjs";
import invariant from "tiny-invariant";

export function joinSectionPath(sectionPath, filePath = []) {
	let imagePath = path.posix.join(sectionPath, ...(filePath ?? []));
	if (process.platform === "win32") {
		imagePath = imagePath.replace(
			"/media/nas/photo/",
			"//192.168.1.189/photo/",
		);
	}
	return imagePath;
}

export async function getFilteredFiles(section, filePath = []) {
	invariant(section.path, 'section.path');
	const imagePath = joinSectionPath(section.path, filePath);
	console.log("reading", imagePath);
	let files = await getFiles(imagePath);

	if (section.from) {
		const iFrom = files.findIndex((x) => path.basename(x) === section.from);
		console.log({iFrom});
		if (iFrom >= 0) {
			files = files.slice(iFrom);
		}
	}
	if (section.till) {
		const iTill = files.findIndex((x) => path.basename(x) === section.till);
		console.log({iTill});
		if (iTill >= 0) {
			files = files.slice(0, iTill + 1);
		}
	}
	return files;
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

	return magicCache("getFiles", async () => {
		let files = await readdir.async(imagePath, {stats: true});
		files = files.map(x => ({...x, isDir: x.isDirectory()}));
		return files;
	}, imagePath);
}

export async function getFileDates(section, imagePath = []) {
	let files = await getFilteredFiles(section, imagePath);
	console.log(files);

	files = files.map((x) => ({
		...x,
		dirPath: path.join(...imagePath, x.path),
		fullPath: path.join(section.path, x.path),
		date: getFileDate(path.join(section.path, x.path), x.ctime),
	}));

	files = files.filter((x) => x.date);
	// console.log(files);

	return files;
}

export function getFileDate(pathName, defaultCtime = null) {
	const fileName = path.basename(pathName);
	const match = fileName.match(/(20\d\d)(\d\d)(\d\d)/);
	if (match) {
		let date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
		// console.log(fileName, date.toISOString());
		return date;
	}

	if (defaultCtime) {
		return defaultCtime;
	}

	try {
		return fs.statSync(pathName).mtime;
	} catch (e) {
		console.error('ERROR', e.message);
		return null;
	}
}
