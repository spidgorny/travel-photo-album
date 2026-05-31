import fs from "fs";
import path from "path";
import { DatabaseSync } from "node:sqlite";
import type { ConfigSection } from "./config.ts";
import { readStoredMetaDirectory } from "./file-meta.ts";
import {
	formatDayKey,
	getFileDate,
	getFilteredFiles,
	joinSectionPath,
} from "./files.ts";

export interface SearchSection extends ConfigSection {
	id: number;
	name: string;
}

export interface SearchResultGroup {
	sectionId: number;
	sectionName: string;
	folder: string;
	date: string;
	count: number;
	matchingFileCount: number;
	previewFiles: string[];
	locations: string[];
}

interface SearchIndexEntryInput {
	sectionId: number;
	sectionName: string;
	folder: string;
	date: string;
	filePath: string;
	fileName: string;
	description: string | null;
	locationLabel: string | null;
	locality: string | null;
	countryName: string | null;
	countryIso2: string | null;
}

const defaultSearchIndexPath = path.join(
	/* turbopackIgnore: true */ process.cwd(),
	"data",
	"search-index.sqlite",
);
const searchIndexPath = process.env.SEARCH_INDEX_PATH?.trim() || defaultSearchIndexPath;

let database: DatabaseSync | null = null;

export function getSearchIndexPath() {
	return searchIndexPath;
}

export function searchIndexExists() {
	return fs.existsSync(searchIndexPath);
}

export function closeSearchIndex() {
	database?.close();
	database = null;
}

export function searchIndexedLibrary(
	sections: SearchSection[],
	query: string,
	limit = 200,
): SearchResultGroup[] {
	if (!searchIndexExists()) {
		return [];
	}

	const sectionIds = sections
		.map((section) => section.id)
		.filter((sectionId) => Number.isInteger(sectionId));
	if (!sectionIds.length) {
		return [];
	}

	const ftsQuery = buildFtsQuery(query);
	if (!ftsQuery) {
		return [];
	}

	const db = openSearchIndex();
	const sectionPlaceholders = sectionIds.map(() => "?").join(", ");
	const groups = db
		.prepare(
			`
			WITH matched_groups AS (
				SELECT
					e.section_id AS sectionId,
					e.section_name AS sectionName,
					e.folder AS folder,
					e.date AS date,
					COUNT(*) AS matchingFileCount
				FROM search_entries e
				JOIN search_entries_fts f ON f.rowid = e.id
				WHERE search_entries_fts MATCH ? AND e.section_id IN (${sectionPlaceholders})
				GROUP BY e.section_id, e.section_name, e.folder, e.date
				ORDER BY e.date DESC, e.section_name ASC, e.folder ASC
				LIMIT ?
			)
			SELECT
				mg.sectionId,
				mg.sectionName,
				mg.folder,
				mg.date,
				mg.matchingFileCount,
				(
					SELECT COUNT(*)
					FROM search_entries entries
					WHERE entries.section_id = mg.sectionId
						AND entries.folder = mg.folder
						AND entries.date = mg.date
				) AS count,
				(
					SELECT json_group_array(file_path)
					FROM (
						SELECT file_path
						FROM search_entries entries
						WHERE entries.section_id = mg.sectionId
							AND entries.folder = mg.folder
							AND entries.date = mg.date
						ORDER BY file_path ASC
						LIMIT 4
					)
				) AS previewFilesJson,
				(
					SELECT json_group_array(label)
					FROM (
						SELECT location_label AS label
						FROM search_entries entries
						WHERE entries.section_id = mg.sectionId
							AND entries.folder = mg.folder
							AND entries.date = mg.date
							AND entries.location_label IS NOT NULL
							AND entries.location_label != ''
						GROUP BY location_label
						ORDER BY COUNT(*) DESC, label ASC
						LIMIT 3
					)
				) AS locationsJson
			FROM matched_groups mg
			ORDER BY mg.date DESC, mg.sectionName ASC, mg.folder ASC
		`,
		)
		.all(ftsQuery, ...sectionIds, limit) as Array<{
		sectionId: number;
		sectionName: string;
		folder: string;
		date: string;
		count: number;
		matchingFileCount: number;
		previewFilesJson: string | null;
		locationsJson: string | null;
	}>;

	return groups.map<SearchResultGroup>((group) => ({
		sectionId: group.sectionId,
		sectionName: group.sectionName,
		folder: group.folder,
		date: group.date,
		count: Number(group.count) || 0,
		matchingFileCount: Number(group.matchingFileCount) || 0,
		previewFiles: parseJsonArray(group.previewFilesJson),
		locations: parseJsonArray(group.locationsJson),
	}));
}

export function getIndexedMatchesForFolder(
	sectionId: number,
	folder: string,
	query: string,
): Set<string> | null {
	if (!searchIndexExists() || !Number.isInteger(sectionId) || sectionId < 0) {
		return null;
	}

	const ftsQuery = buildFtsQuery(query);
	if (!ftsQuery) {
		return new Set();
	}

	const rows = openSearchIndex()
		.prepare(
			`
			SELECT e.file_name AS fileName
			FROM search_entries e
			JOIN search_entries_fts f ON f.rowid = e.id
			WHERE search_entries_fts MATCH ? AND e.section_id = ? AND e.folder = ?
		`,
		)
		.all(ftsQuery, sectionId, folder) as Array<{ fileName: string }>;

	return new Set(
		rows
			.map((row) => row.fileName)
			.filter((fileName): fileName is string => typeof fileName === "string" && fileName.length > 0),
	);
}

export async function rebuildSearchIndex(
	sections: SearchSection[],
	options: { replaceAll?: boolean } = {},
) {
	const db = openSearchIndex();
	const replaceAll = options.replaceAll !== false;
	if (replaceAll) {
		db.exec("DELETE FROM search_entries_fts; DELETE FROM search_entries;");
	}

	for (const section of sections) {
		deleteSectionEntries(section.id);
		await indexSection(section);
	}

	return countSearchEntries();
}

export function countSearchEntries() {
	const row = openSearchIndex()
		.prepare("SELECT COUNT(*) AS count FROM search_entries")
		.get() as { count: number };
	return Number(row?.count) || 0;
}

function openSearchIndex() {
	if (!database) {
		fs.mkdirSync(path.dirname(searchIndexPath), { recursive: true });
		database = new DatabaseSync(searchIndexPath);
		database.exec(`
			PRAGMA journal_mode = WAL;
			PRAGMA synchronous = NORMAL;
			PRAGMA busy_timeout = 5000;
			CREATE TABLE IF NOT EXISTS search_entries (
				id INTEGER PRIMARY KEY,
				section_id INTEGER NOT NULL,
				section_name TEXT NOT NULL,
				folder TEXT NOT NULL,
				date TEXT NOT NULL,
				file_path TEXT NOT NULL UNIQUE,
				file_name TEXT NOT NULL,
				description TEXT,
				location_label TEXT,
				locality TEXT,
				country_name TEXT,
				country_iso2 TEXT
			);
			CREATE INDEX IF NOT EXISTS search_entries_section_folder_date_idx
				ON search_entries(section_id, folder, date);
			CREATE INDEX IF NOT EXISTS search_entries_date_idx
				ON search_entries(date);
			CREATE VIRTUAL TABLE IF NOT EXISTS search_entries_fts USING fts5(
				file_path UNINDEXED,
				description,
				location_label,
				locality,
				country_name,
				country_iso2,
				tokenize = 'unicode61 remove_diacritics 2'
			);
		`);
	}

	return database;
}

async function indexSection(section: SearchSection) {
	const pendingFolders: string[][] = [[]];

	while (pendingFolders.length > 0) {
		const folder = pendingFolders.pop() ?? [];
		let entries;
		try {
			entries = await getFilteredFiles(section, folder);
		} catch (error) {
			console.warn(
				`Skipping search indexing for collection "${section.name}" because its source path is unavailable.`,
				error,
			);
			return;
		}

		const childFolders = entries
			.filter((entry) => entry.isDir)
			.map((entry) => [...folder, entry.path]);
		pendingFolders.push(...childFolders);

		const fileEntries = entries.filter((entry) => !entry.isDir);
		if (!fileEntries.length) {
			continue;
		}

		const folderPath = normalizeFolderPath(folder.join("/"));
		const directoryMeta = await readStoredMetaDirectory(section, [...folder, fileEntries[0].path]);

		for (const fileEntry of fileEntries) {
			const filePath = [...folder, fileEntry.path];
			const joinedPath = filePath.join("/");
			const date = getFileDate(
				joinSectionPath(section.path ?? "", filePath),
				getStatsDate(fileEntry.stats?.ctime),
			);
			if (!date) {
				continue;
			}

			const fileMeta = directoryMeta[fileEntry.path];
			upsertSearchEntry({
				sectionId: section.id,
				sectionName: section.name,
				folder: folderPath,
				date: formatDayKey(date),
				filePath: joinedPath,
				fileName: fileEntry.path,
				description: normalizeText(fileMeta?.description),
				locationLabel: normalizeText(fileMeta?.location?.label),
				locality: normalizeText(fileMeta?.location?.locality),
				countryName: normalizeText(fileMeta?.location?.countryName),
				countryIso2: normalizeText(fileMeta?.location?.countryIso2),
			});
		}
	}
}

function deleteSectionEntries(sectionId: number) {
	const db = openSearchIndex();
	const rows = db
		.prepare("SELECT id FROM search_entries WHERE section_id = ?")
		.all(sectionId) as Array<{ id: number }>;
	const deleteEntryStatement = db.prepare("DELETE FROM search_entries WHERE section_id = ?");
	const deleteFtsStatement = db.prepare("DELETE FROM search_entries_fts WHERE rowid = ?");

	for (const row of rows) {
		deleteFtsStatement.run(row.id);
	}
	deleteEntryStatement.run(sectionId);
}

function upsertSearchEntry(entry: SearchIndexEntryInput) {
	const db = openSearchIndex();
	const existingRow = db
		.prepare("SELECT id FROM search_entries WHERE file_path = ?")
		.get(entry.filePath) as { id: number } | undefined;

	if (existingRow) {
		db.prepare(
			`
			UPDATE search_entries
			SET
				section_id = ?,
				section_name = ?,
				folder = ?,
				date = ?,
				file_name = ?,
				description = ?,
				location_label = ?,
				locality = ?,
				country_name = ?,
				country_iso2 = ?
			WHERE id = ?
		`,
		).run(
			entry.sectionId,
			entry.sectionName,
			entry.folder,
			entry.date,
			entry.fileName,
			entry.description,
			entry.locationLabel,
			entry.locality,
			entry.countryName,
			entry.countryIso2,
			existingRow.id,
		);
		db.prepare("DELETE FROM search_entries_fts WHERE rowid = ?").run(existingRow.id);
		db.prepare(
			`
			INSERT INTO search_entries_fts(
				rowid,
				file_path,
				description,
				location_label,
				locality,
				country_name,
				country_iso2
			) VALUES (?, ?, ?, ?, ?, ?, ?)
		`,
		).run(
			existingRow.id,
			entry.filePath,
			entry.description,
			entry.locationLabel,
			entry.locality,
			entry.countryName,
			entry.countryIso2,
		);
		return;
	}

	const insertResult = db
		.prepare(
			`
			INSERT INTO search_entries(
				section_id,
				section_name,
				folder,
				date,
				file_path,
				file_name,
				description,
				location_label,
				locality,
				country_name,
				country_iso2
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`,
		)
		.run(
			entry.sectionId,
			entry.sectionName,
			entry.folder,
			entry.date,
			entry.filePath,
			entry.fileName,
			entry.description,
			entry.locationLabel,
			entry.locality,
			entry.countryName,
			entry.countryIso2,
		);

	db.prepare(
		`
		INSERT INTO search_entries_fts(
			rowid,
			file_path,
			description,
			location_label,
			locality,
			country_name,
			country_iso2
		) VALUES (?, ?, ?, ?, ?, ?, ?)
	`,
	).run(
		Number(insertResult.lastInsertRowid),
		entry.filePath,
		entry.description,
		entry.locationLabel,
		entry.locality,
		entry.countryName,
		entry.countryIso2,
	);
}

function buildFtsQuery(query: string) {
	const tokens = normalizeText(query)
		?.match(/[\p{L}\p{N}]+/gu)
		?.filter(Boolean);
	if (!tokens?.length) {
		return null;
	}

	return tokens.map((token) => `${token}*`).join(" AND ");
}

function normalizeText(value: unknown) {
	if (typeof value !== "string") {
		return null;
	}
	const normalized = value.trim();
	return normalized.length > 0 ? normalized : null;
}

function normalizeFolderPath(folder: string) {
	return folder === "." ? "" : folder;
}

function parseJsonArray(value: string | null) {
	if (!value) {
		return [];
	}
	try {
		const parsed = JSON.parse(value) as unknown[];
		return parsed.filter((item): item is string => typeof item === "string" && item.length > 0);
	} catch {
		return [];
	}
}

function getStatsDate(value: unknown) {
	return value instanceof Date ? value : null;
}
