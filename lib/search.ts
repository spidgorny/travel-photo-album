import type { ConfigSection } from "./config.ts";
import {
	getStoredMetaDirectoryKey,
	normalizeStoredDescription,
	readStoredMetaDirectory,
} from "./file-meta.ts";
import type { StoredDirectoryMetaEntry } from "./files-types.ts";
import {
	getMatchingFilesForFolder,
	searchLibrary,
	type SearchResultGroup,
	type SearchSection,
} from "./search-backend.ts";

export function normalizeSearchQuery(value: string | null | undefined) {
	const normalized = value?.trim().toLocaleLowerCase();
	return normalized && normalized.length > 0 ? normalized : null;
}

export function fileMetaMatchesSearchQuery(
	fileMeta: StoredDirectoryMetaEntry | null | undefined,
	searchQuery: string,
) {
	return getFileSearchTerms(fileMeta).some((term) => term.includes(searchQuery));
}

export async function filterFilesBySearchQuery<
	TFile extends { path?: string; dirPath?: string },
>(section: ConfigSection, files: TFile[], searchQuery: string): Promise<TFile[]> {
	const indexedMatches = await getMatchingFilesForFolder(
		(section as ConfigSection & { id?: number }).id ?? -1,
		normalizeFolderPath(
			String(files[0]?.dirPath ?? files[0]?.path ?? "")
				.split("/")
				.filter(Boolean)
				.slice(0, -1)
				.join("/"),
		),
		searchQuery,
	);
	if (indexedMatches) {
		return files.filter((file) =>
			indexedMatches.has(String(file.path ?? "").split("/").filter(Boolean).at(-1) ?? ""),
		);
	}

	const metaCache = new Map<string, Record<string, StoredDirectoryMetaEntry>>();
	const matchingFiles: TFile[] = [];

	for (const file of files) {
		const filePath = String(file.dirPath ?? file.path)
			.split("/")
			.filter(Boolean);
		const metaFile = getStoredMetaDirectoryKey(section, filePath);
		const metaData =
			metaCache.get(metaFile) ?? (await readStoredMetaDirectory(section, filePath));
		metaCache.set(metaFile, metaData);

		const fileMeta = metaData[pathBaseName(filePath)];
		if (fileMetaMatchesSearchQuery(fileMeta, searchQuery)) {
			matchingFiles.push(file);
		}
	}

	return matchingFiles;
}

export async function searchPhotoLibrary(
	sections: SearchSection[],
	query: string,
): Promise<SearchResultGroup[]> {
	const searchQuery = normalizeSearchQuery(query);
	if (!searchQuery) {
		return [];
	}

	return searchLibrary(sections, searchQuery);
}

function getFileSearchTerms(fileMeta: StoredDirectoryMetaEntry | null | undefined) {
	const description = normalizeStoredDescription(fileMeta?.description);
	const location = fileMeta?.location;
	const personNames = Array.isArray(fileMeta?.personNames) ? fileMeta.personNames : [];

	return [
		description,
		...personNames,
		location?.label,
		location?.locality,
		location?.countryName,
		location?.countryIso2,
	]
		.map((value) => normalizeSearchValue(value))
		.filter((value): value is string => Boolean(value));
}

function normalizeFolderPath(folder: string) {
	return folder === "." ? "" : folder;
}

function normalizeSearchValue(value: unknown) {
	return typeof value === "string" && value.trim().length > 0
		? value.trim().toLocaleLowerCase()
		: null;
}

function pathBaseName(filePath: string[]) {
	return filePath[filePath.length - 1] ?? "";
}
