import {
	getIndexedMatchesForFolder as getIndexedMatchesForFolderFromIndex,
	searchIndexedLibrary as searchIndexedLibraryFromIndex,
	type SearchResultGroup,
	type SearchSection,
} from "./search-index.ts";

export type { SearchResultGroup, SearchSection };

export async function searchLibrary(
	sections: SearchSection[],
	query: string,
	limit?: number,
): Promise<SearchResultGroup[]> {
	return await searchIndexedLibraryFromIndex(query, sections, limit);
}

export async function getMatchingFilesForFolder(
	sectionId: number,
	folder: string,
	query: string,
) {
	return await getIndexedMatchesForFolderFromIndex(sectionId, folder, query);
}
