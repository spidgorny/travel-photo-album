// @ts-nocheck
import path from "path";
import readdir from "@jsdevtools/readdir-enhanced";
import fs from "fs";
import { magicCache } from "./cache.ts";
import invariant from "tiny-invariant";
import type { ConfigSection } from "./config.ts";
import type {
	DatedFileEntry,
	FileEntryWithOptionalDate,
	FilteredFileEntry,
} from "./files-types.ts";
import {
	readStoredFolderListing,
	storeFolderListing,
} from "./folder-store.ts";

export function joinSectionPath(
	sectionPath: string,
	filePath: string[] = [],
): string {
	let imagePath = path.posix.join(sectionPath, ...(filePath ?? []));
	if (process.platform === "win32") {
		imagePath = imagePath.replace(
			"/media/nas/photo/",
			"//192.168.1.189/photo/",
		);
	}
	return imagePath;
}

export function isHiddenPathSegment(segment: string): boolean {
	return typeof segment === "string" && segment.startsWith(".");
}

export function hasHiddenPathSegment(filePath: string[] | string): boolean {
	const segments = Array.isArray(filePath) ? filePath : filePath.split("/");
	return segments.some((segment) => isHiddenPathSegment(segment));
}

export async function getFilteredFiles(
	section: ConfigSection,
	filePath: string[] = [],
): Promise<FilteredFileEntry[]> {
	invariant(section.path, 'section.path');

	// Try Kvrocks-backed folder listing first (stable across mounts/platforms).
	const kvListing = await readStoredFolderListing(section, filePath);
	let files: FilteredFileEntry[];

	if (kvListing) {
		files = kvListing;
	} else {
		const imagePath = joinSectionPath(section.path, filePath);
		console.log("reading", imagePath);
		files = await getFiles(imagePath);
		// Lazily persist to Kvrocks so future reads don't need the filesystem.
		const kvEntries = files.map((f) => ({
			name: f.path,
			isDirectory: () => f.isDir,
			ctime: f.stats?.ctime instanceof Date ? f.stats.ctime : null,
			mtime: f.stats?.mtime instanceof Date ? f.stats.mtime : null,
		}));
		storeFolderListing(section, filePath, kvEntries).catch((e) => {
			console.warn("folder-store: lazy write failed:", e?.message ?? e);
		});
	}

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
	files = files.filter((entry) => !hasHiddenPathSegment(entry.path));
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
		files = files.map((x) => ({
			path: x.path,
			stats: {...x},
			isDir: x.isDirectory(),
		}));
		return files;
	}, imagePath);
}

export async function getFileDates(
	section: ConfigSection,
	imagePath: string[] = [],
): Promise<DatedFileEntry[]> {
	const files = await getFilesWithOptionalDates(section, imagePath);
	return files.filter((x): x is DatedFileEntry => Boolean(x.date));
}

export async function getFilesWithOptionalDates(
	section: ConfigSection,
	imagePath: string[] = [],
): Promise<FileEntryWithOptionalDate[]> {
	return magicCache(
		"getFilesWithOptionalDates",
		async () => {
			let files = await getFilteredFiles(section, imagePath);

			files = files.map((x) => ({
				...x,
				dirPath: path.join(...imagePath, x.path),
				fullPath: joinSectionPath(section.path, [...imagePath, x.path]),
				date: getFileDate(
					joinSectionPath(section.path, [...imagePath, x.path]),
					x.stats?.ctime instanceof Date ? x.stats.ctime : null,
				),
			}));

			return files;
		},
		{
			sectionPath: section.path,
			sectionFrom: section.from ?? null,
			sectionTill: section.till ?? null,
			imagePath,
		},
	);
}

export function getFileDate(
	pathName: string,
	defaultCtime: Date | null = null,
): Date | null {
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

export function formatDayKey(date: Date): string {
	return [
		date.getFullYear(),
		String(date.getMonth() + 1).padStart(2, "0"),
		String(date.getDate()).padStart(2, "0"),
	].join("-");
}

export function parseDayKey(value: string): string | null {
	const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
	if (match) {
		return `${match[1]}-${match[2]}-${match[3]}`;
	}
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return null;
	}
	return formatDayKey(date);
}
