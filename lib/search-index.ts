import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import config, { type ConfigSection } from "./config.ts";
import {
	listStoredMetaFilePaths,
	readStoredMetaDirectory,
} from "./file-meta.ts";
import type { StoredDirectoryMetaEntry } from "./files-types.ts";
import { formatDayKey, getFileDate } from "./files.ts";

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
	description: string;
	locationLabel: string;
	locality: string;
	countryName: string;
	countryIso2: string;
}

interface SearchEntryDocument extends SearchIndexEntryInput {
	id: string;
	folderKey: string;
	groupKey: string;
}

interface SearchGroupDocument {
	id: string;
	group_key: string;
	section_id: number;
	section_name: string;
	folder: string;
	folder_key: string;
	date: string;
	count: number;
	preview_files: string[];
	locations: string[];
}

interface SearchHit<TDocument> {
	document?: TDocument;
}

interface SearchGroupedHit<TDocument> {
	found?: number;
	hits?: Array<SearchHit<TDocument>>;
}

interface SearchResponse<TDocument> {
	hits?: Array<SearchHit<TDocument>>;
	grouped_hits?: Array<SearchGroupedHit<TDocument>>;
	num_documents?: number;
}

interface TypesenseConfig {
	apiKey: string;
	baseUrl: string;
	entriesCollection: string;
	groupsCollection: string;
}

interface GroupAccumulator {
	sectionId: number;
	sectionName: string;
	folder: string;
	date: string;
	filePaths: string[];
	locationCounts: Map<string, number>;
}

export interface RebuildSearchIndexProgress {
	phase:
		| "prepare"
		| "section-start"
		| "section-scan"
		| "section-import"
		| "section-complete";
	sectionId?: number;
	sectionName?: string;
	source?: "thumb-meta" | "stored-meta";
	metaFilesScanned?: number;
	filesScanned?: number;
	entriesCollected?: number;
	groupsCollected?: number;
	documentsImported?: number;
	totalDocuments?: number;
	batchNumber?: number;
	batchCount?: number;
	replaceAll?: boolean;
}

const SEARCH_QUERY_FIELDS = [
	"description",
	"location_label",
	"locality",
	"country_name",
	"country_iso2",
];
const DEFAULT_ENTRIES_COLLECTION = "photo_search_entries";
const DEFAULT_GROUPS_COLLECTION = "photo_search_groups";
const IMPORT_BATCH_SIZE = 500;
const PAGE_SIZE = 250;
const DEFAULT_GROUP_LIMIT = 200;

class TypesenseHttpError extends Error {
	status: number;
	body: string;

	constructor(
		status: number,
		body: string,
		message = `Typesense request failed with status ${status}`,
	) {
		super(message);
		this.status = status;
		this.body = body;
	}
}

function sha1(value: string) {
	return crypto.createHash("sha1").update(value).digest("hex");
}

function getTypesenseConfig(): TypesenseConfig | null {
	const apiKey = process.env.TYPESENSE_API_KEY?.trim();
	if (!apiKey) {
		return null;
	}

	const entriesCollection =
		process.env.TYPESENSE_SEARCH_ENTRIES_COLLECTION?.trim() ||
		DEFAULT_ENTRIES_COLLECTION;
	const groupsCollection =
		process.env.TYPESENSE_SEARCH_GROUPS_COLLECTION?.trim() || DEFAULT_GROUPS_COLLECTION;
	const explicitUrl = process.env.TYPESENSE_URL?.trim();
	if (explicitUrl) {
		return {
			apiKey,
			baseUrl: explicitUrl.replace(/\/+$/, ""),
			entriesCollection,
			groupsCollection,
		};
	}

	const host = process.env.TYPESENSE_HOST?.trim();
	if (!host) {
		return null;
	}

	const protocol = process.env.TYPESENSE_PROTOCOL?.trim() || "http";
	const port = process.env.TYPESENSE_PORT?.trim();
	return {
		apiKey,
		baseUrl: `${protocol}://${host}${port ? `:${port}` : ""}`,
		entriesCollection,
		groupsCollection,
	};
}

function requireTypesenseConfig() {
	const typesense = getTypesenseConfig();
	if (!typesense) {
		throw new Error(
			"Typesense search index requires TYPESENSE_API_KEY and TYPESENSE_URL or TYPESENSE_HOST",
		);
	}
	return typesense;
}

function getDefaultSections(): SearchSection[] {
	return (Array.isArray(config.sections) ? config.sections : []).map((section, index) => ({
		...section,
		id: index,
		name: section.name,
	}));
}

function normalizeQuery(query: string) {
	return query.trim().replace(/\s+/g, " ").toLowerCase();
}

function readString(value: unknown) {
	return typeof value === "string" ? value : "";
}

function trimString(value: unknown) {
	return readString(value).trim();
}

function buildFolderKey(folder: string) {
	return sha1(folder);
}

function buildGroupKey(sectionId: number, folder: string, date: string) {
	return sha1(`${sectionId}:${folder}:${date}`);
}

function buildDocumentId(sectionId: number, filePath: string) {
	return sha1(`${sectionId}:${filePath}`);
}

function buildLocationLabel(fileMeta: StoredDirectoryMetaEntry) {
	const record = fileMeta as Record<string, unknown>;
	return (
		fileMeta.location?.label ||
		trimString(record.descriptionLocation) ||
		trimString(record.descriptionCountry) ||
		fileMeta.location?.countryName ||
		trimString(record.countryName) ||
		trimString(record.country) ||
		fileMeta.location?.locality ||
		trimString(record.locality) ||
		fileMeta.location?.countryIso2 ||
		trimString(record.countryCode)
	);
}

function buildSearchEntryInput(
	section: SearchSection,
	filePath: string,
	fileMeta: StoredDirectoryMetaEntry,
	fallbackDate?: string,
): SearchIndexEntryInput | null {
	const record = fileMeta as Record<string, unknown>;
	const description = trimString(fileMeta.description);
	const locationLabel = buildLocationLabel(fileMeta);
	if (!description && !locationLabel) {
		return null;
	}

	const fileName = path.posix.basename(filePath);
	const inferredDate = getFileDate(trimString(record.baseName) || fileName, null);
	const date = trimString(fileMeta.date) || (inferredDate ? formatDayKey(inferredDate) : fallbackDate);
	if (!date) {
		return null;
	}

	return {
		sectionId: section.id,
		sectionName: section.name,
		folder: path.posix.dirname(filePath),
		date,
		filePath,
		fileName,
		description,
		locationLabel,
		locality: trimString(fileMeta.location?.locality || record.locality),
		countryName: trimString(
			fileMeta.location?.countryName || record.countryName || record.country,
		),
		countryIso2: trimString(
			fileMeta.location?.countryIso2 || record.countryCode,
		).toUpperCase(),
	};
}

function toSearchEntryDocument(entry: SearchIndexEntryInput): SearchEntryDocument {
	return {
		...entry,
		id: buildDocumentId(entry.sectionId, entry.filePath),
		folderKey: buildFolderKey(entry.folder),
		groupKey: buildGroupKey(entry.sectionId, entry.folder, entry.date),
	};
}

function toTypesenseEntryDocument(entry: SearchEntryDocument) {
	return {
		id: entry.id,
		section_id: entry.sectionId,
		section_name: entry.sectionName,
		folder: entry.folder,
		folder_key: entry.folderKey,
		date: entry.date,
		file_path: entry.filePath,
		file_name: entry.fileName,
		description: entry.description,
		location_label: entry.locationLabel,
		locality: entry.locality,
		country_name: entry.countryName,
		country_iso2: entry.countryIso2,
		group_key: entry.groupKey,
	};
}

function fromTypesenseEntryDocument(document: Record<string, unknown>): SearchEntryDocument | null {
	const sectionId = Number(document.section_id);
	const sectionName = trimString(document.section_name);
	const folder = trimString(document.folder);
	const date = trimString(document.date);
	const filePath = trimString(document.file_path);
	const fileName = trimString(document.file_name);
	if (
		!Number.isFinite(sectionId) ||
		!sectionName ||
		!folder ||
		!date ||
		!filePath ||
		!fileName
	) {
		return null;
	}

	return {
		id: trimString(document.id) || buildDocumentId(sectionId, filePath),
		sectionId,
		sectionName,
		folder,
		date,
		filePath,
		fileName,
		description: trimString(document.description),
		locationLabel: trimString(document.location_label),
		locality: trimString(document.locality),
		countryName: trimString(document.country_name),
		countryIso2: trimString(document.country_iso2),
		folderKey: trimString(document.folder_key) || buildFolderKey(folder),
		groupKey: trimString(document.group_key) || buildGroupKey(sectionId, folder, date),
	};
}

function buildGroupDocumentFromEntries(
	entries: SearchEntryDocument[],
): SearchGroupDocument | null {
	if (entries.length === 0) {
		return null;
	}

	const first = entries[0];
	const locationCounts = new Map<string, number>();
	for (const entry of entries) {
		if (!entry.locationLabel) {
			continue;
		}
		locationCounts.set(
			entry.locationLabel,
			(locationCounts.get(entry.locationLabel) || 0) + 1,
		);
	}

	return {
		id: first.groupKey,
		group_key: first.groupKey,
		section_id: first.sectionId,
		section_name: first.sectionName,
		folder: first.folder,
		folder_key: first.folderKey,
		date: first.date,
		count: entries.length,
		preview_files: [...entries]
			.sort((left, right) => left.filePath.localeCompare(right.filePath))
			.slice(0, 4)
			.map((entry) => entry.filePath),
		locations: [...locationCounts.entries()]
			.sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
			.slice(0, 3)
			.map(([label]) => label),
	};
}

function buildGroupDocumentFromAccumulator(
	groupKey: string,
	group: GroupAccumulator,
): SearchGroupDocument {
	return {
		id: groupKey,
		group_key: groupKey,
		section_id: group.sectionId,
		section_name: group.sectionName,
		folder: group.folder,
		folder_key: buildFolderKey(group.folder),
		date: group.date,
		count: group.filePaths.length,
		preview_files: [...group.filePaths].sort().slice(0, 4),
		locations: [...group.locationCounts.entries()]
			.sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
			.slice(0, 3)
			.map(([label]) => label),
	};
}

function toSearchResultGroup(
	entry: SearchEntryDocument,
	group: SearchGroupDocument | null,
	matchingFileCount: number,
): SearchResultGroup {
	return {
		sectionId: entry.sectionId,
		sectionName: entry.sectionName,
		folder: entry.folder,
		date: entry.date,
		count: group?.count || matchingFileCount,
		matchingFileCount,
		previewFiles: group?.preview_files || [entry.filePath],
		locations: group?.locations || (entry.locationLabel ? [entry.locationLabel] : []),
	};
}

class SectionAccumulator {
	readonly entries: SearchEntryDocument[] = [];
	readonly groups = new Map<string, GroupAccumulator>();

	add(entryInput: SearchIndexEntryInput) {
		const entry = toSearchEntryDocument(entryInput);
		this.entries.push(entry);

		const current =
			this.groups.get(entry.groupKey) ||
			({
				sectionId: entry.sectionId,
				sectionName: entry.sectionName,
				folder: entry.folder,
				date: entry.date,
				filePaths: [],
				locationCounts: new Map<string, number>(),
			} satisfies GroupAccumulator);

		current.filePaths.push(entry.filePath);
		if (entry.locationLabel) {
			current.locationCounts.set(
				entry.locationLabel,
				(current.locationCounts.get(entry.locationLabel) || 0) + 1,
			);
		}
		this.groups.set(entry.groupKey, current);
	}

	buildGroupDocuments() {
		return [...this.groups.entries()].map(([groupKey, group]) =>
			buildGroupDocumentFromAccumulator(groupKey, group),
		);
	}
}

function addEntryFromStoredMeta(
	accumulator: SectionAccumulator,
	section: SearchSection,
	filePath: string,
	fileMeta: StoredDirectoryMetaEntry,
	fallbackDate?: string,
) {
	const entry = buildSearchEntryInput(section, filePath, fileMeta, fallbackDate);
	if (entry) {
		accumulator.add(entry);
	}
}

async function requestTypesense(
	requestPath: string,
	init: RequestInit = {},
): Promise<{ response: Response; body: string }> {
	const typesense = requireTypesenseConfig();
	const headers = new Headers(init.headers);
	headers.set("X-TYPESENSE-API-KEY", typesense.apiKey);
	if (init.body && !headers.has("Content-Type")) {
		headers.set("Content-Type", "application/json");
	}

	const response = await fetch(`${typesense.baseUrl}${requestPath}`, {
		...init,
		headers,
	});
	const body = await response.text();
	if (!response.ok) {
		throw new TypesenseHttpError(response.status, body);
	}
	return { response, body };
}

async function requestTypesenseJson<TResponse>(
	requestPath: string,
	init: RequestInit = {},
): Promise<TResponse> {
	const { body } = await requestTypesense(requestPath, init);
	return body ? (JSON.parse(body) as TResponse) : ({} as TResponse);
}

async function collectionExists(collectionName: string) {
	try {
		await requestTypesenseJson(`/collections/${encodeURIComponent(collectionName)}`);
		return true;
	} catch (error) {
		if (error instanceof TypesenseHttpError && error.status === 404) {
			return false;
		}
		throw error;
	}
}

async function createCollection(
	collectionName: string,
	fields: Array<Record<string, unknown>>,
) {
	await requestTypesense("/collections", {
		method: "POST",
		body: JSON.stringify({
			name: collectionName,
			fields,
		}),
	});
}

async function ensureCollections() {
	const typesense = requireTypesenseConfig();

	if (!(await collectionExists(typesense.entriesCollection))) {
		await createCollection(typesense.entriesCollection, [
			{ name: "section_id", type: "int32", facet: true },
			{ name: "section_name", type: "string", sort: true },
			{ name: "folder", type: "string", sort: true },
			{ name: "folder_key", type: "string", facet: true },
			{ name: "date", type: "string", sort: true },
			{ name: "file_path", type: "string", sort: true },
			{ name: "file_name", type: "string", sort: true },
			{ name: "description", type: "string" },
			{ name: "location_label", type: "string" },
			{ name: "locality", type: "string" },
			{ name: "country_name", type: "string" },
			{ name: "country_iso2", type: "string" },
			{ name: "group_key", type: "string", facet: true },
		]);
	}

	if (!(await collectionExists(typesense.groupsCollection))) {
		await createCollection(typesense.groupsCollection, [
			{ name: "group_key", type: "string", facet: true },
			{ name: "section_id", type: "int32", facet: true },
			{ name: "section_name", type: "string", sort: true },
			{ name: "folder", type: "string", sort: true },
			{ name: "folder_key", type: "string", facet: true },
			{ name: "date", type: "string", sort: true },
			{ name: "count", type: "int32" },
			{ name: "preview_files", type: "string[]" },
			{ name: "locations", type: "string[]" },
		]);
	}
}

async function dropCollection(collectionName: string) {
	try {
		await requestTypesense(`/collections/${encodeURIComponent(collectionName)}`, {
			method: "DELETE",
		});
	} catch (error) {
		if (!(error instanceof TypesenseHttpError) || error.status !== 404) {
			throw error;
		}
	}
}

async function deleteDocumentsByFilter(collectionName: string, filterBy: string) {
	try {
		await requestTypesense(
			`/collections/${encodeURIComponent(collectionName)}/documents?${new URLSearchParams({
				filter_by: filterBy,
			}).toString()}`,
			{ method: "DELETE" },
		);
	} catch (error) {
		if (!(error instanceof TypesenseHttpError) || error.status !== 404) {
			throw error;
		}
	}
}

async function getDocumentById<TDocument>(
	collectionName: string,
	documentId: string,
): Promise<TDocument | null> {
	try {
		return await requestTypesenseJson<TDocument>(
			`/collections/${encodeURIComponent(collectionName)}/documents/${encodeURIComponent(documentId)}`,
		);
	} catch (error) {
		if (error instanceof TypesenseHttpError && error.status === 404) {
			return null;
		}
		throw error;
	}
}

async function deleteDocumentById(collectionName: string, documentId: string) {
	try {
		await requestTypesense(
			`/collections/${encodeURIComponent(collectionName)}/documents/${encodeURIComponent(documentId)}`,
			{ method: "DELETE" },
		);
	} catch (error) {
		if (!(error instanceof TypesenseHttpError) || error.status !== 404) {
			throw error;
		}
	}
}

async function importDocuments<TDocument extends object>(
	collectionName: string,
	documents: TDocument[],
	onProgress?: (importedDocuments: number, totalDocuments: number, batchNumber: number, batchCount: number) => void,
) {
	if (documents.length === 0) {
		return;
	}

	const batchCount = Math.ceil(documents.length / IMPORT_BATCH_SIZE);
	for (let index = 0; index < documents.length; index += IMPORT_BATCH_SIZE) {
		const batch = documents.slice(index, index + IMPORT_BATCH_SIZE);
		const payload = batch.map((document) => JSON.stringify(document)).join("\n");
		const { body } = await requestTypesense(
			`/collections/${encodeURIComponent(collectionName)}/documents/import?action=upsert`,
			{
				method: "POST",
				headers: { "Content-Type": "text/plain" },
				body: payload,
			},
		);

		const failures = body
			.split("\n")
			.map((line) => line.trim())
			.filter(Boolean)
			.map((line) => JSON.parse(line) as { success?: boolean; error?: string })
			.filter((line) => line.success === false);
		if (failures.length > 0) {
			throw new Error(failures.map((failure) => failure.error).join("; "));
		}
		onProgress?.(
			Math.min(index + batch.length, documents.length),
			documents.length,
			Math.floor(index / IMPORT_BATCH_SIZE) + 1,
			batchCount,
		);
	}
}

async function searchCollection<TDocument>(
	collectionName: string,
	params: Record<string, string>,
) {
	return await requestTypesenseJson<SearchResponse<TDocument>>(
		`/collections/${encodeURIComponent(collectionName)}/documents/search?${new URLSearchParams(params).toString()}`,
	);
}

function getEntrySearchParams(query: string) {
	return {
		q: query,
		query_by: SEARCH_QUERY_FIELDS.join(","),
		query_by_weights: "10,8,4,3,2",
		prefix: "true,true,true,true,true",
		num_typos: "0,0,0,0,0",
		drop_tokens_threshold: "0",
	};
}

async function listEntriesForGroup(sectionId: number, groupKey: string) {
	const typesense = requireTypesenseConfig();
	const entries: SearchEntryDocument[] = [];
	let page = 1;

	while (true) {
		const response = await searchCollection<Record<string, unknown>>(
			typesense.entriesCollection,
			{
				q: "*",
				query_by: "file_name",
				filter_by: `section_id:=${sectionId}&&group_key:=${groupKey}`,
				sort_by: "file_path:asc",
				per_page: String(PAGE_SIZE),
				page: String(page),
			},
		);

		const documents =
			response.hits
				?.map((hit) => fromTypesenseEntryDocument(hit.document || {}))
				.filter((document): document is SearchEntryDocument => Boolean(document)) || [];
		entries.push(...documents);

		if (documents.length < PAGE_SIZE) {
			break;
		}
		page += 1;
	}

	return entries;
}

async function refreshGroupSummary(sectionId: number, groupKey: string) {
	const typesense = requireTypesenseConfig();
	const entries = await listEntriesForGroup(sectionId, groupKey);
	if (entries.length === 0) {
		await deleteDocumentById(typesense.groupsCollection, groupKey);
		return;
	}

	const groupDocument = buildGroupDocumentFromEntries(entries);
	if (groupDocument) {
		await importDocuments(typesense.groupsCollection, [groupDocument]);
	}
}

function walkFilesNamed(rootPath: string, targetName: string) {
	if (!fs.existsSync(rootPath)) {
		return [] as string[];
	}

	const matches: string[] = [];
	const directories = [rootPath];
	while (directories.length > 0) {
		const currentDirectory = directories.pop();
		if (!currentDirectory) {
			continue;
		}

		for (const entry of fs.readdirSync(currentDirectory, { withFileTypes: true })) {
			const entryPath = path.join(currentDirectory, entry.name);
			if (entry.isDirectory()) {
				directories.push(entryPath);
				continue;
			}
			if (entry.isFile() && entry.name === targetName) {
				matches.push(entryPath);
			}
		}
	}

	return matches;
}

async function indexSectionFromThumbMetaFiles(
	section: SearchSection,
	accumulator: SectionAccumulator,
	onProgress?: (event: RebuildSearchIndexProgress) => void,
) {
	if (!section.thumbPath || !fs.existsSync(section.thumbPath)) {
		return false;
	}

	let indexed = false;
	let metaFilesScanned = 0;
	for (const metaFilePath of walkFilesNamed(section.thumbPath, "meta.json")) {
		metaFilesScanned += 1;
		const folderParts = path
			.relative(section.thumbPath, path.dirname(metaFilePath))
			.split(path.sep)
			.filter(Boolean);
		const storedMeta = await readStoredMetaDirectory(section, folderParts);
		for (const [relativeFilePath, fileMeta] of Object.entries(storedMeta)) {
			indexed = true;
			const filePath = folderParts.length
				? path.posix.join(...folderParts, relativeFilePath)
				: relativeFilePath;
			addEntryFromStoredMeta(accumulator, section, filePath, fileMeta);
		}
		onProgress?.({
			phase: "section-scan",
			sectionId: section.id,
			sectionName: section.name,
			source: "thumb-meta",
			metaFilesScanned,
			entriesCollected: accumulator.entries.length,
			groupsCollected: accumulator.groups.size,
		});
	}

	return indexed;
}

async function indexSectionFromStoredMetaRegistry(
	section: SearchSection,
	accumulator: SectionAccumulator,
	onProgress?: (event: RebuildSearchIndexProgress) => void,
) {
	const filePaths = await listStoredMetaFilePaths(section);
	if (filePaths.length === 0) {
		return false;
	}

	let indexed = false;
	let filesScanned = 0;
	for (const filePathParts of filePaths) {
		filesScanned += 1;
		const filePath = filePathParts.join("/");
		const storedMeta = await readStoredMetaDirectory(section, filePathParts);
		const fileMeta = storedMeta[filePathParts[filePathParts.length - 1] || ""];
		if (!fileMeta) {
			continue;
		}

		indexed = true;
		addEntryFromStoredMeta(accumulator, section, filePath, fileMeta);
		onProgress?.({
			phase: "section-scan",
			sectionId: section.id,
			sectionName: section.name,
			source: "stored-meta",
			filesScanned,
			entriesCollected: accumulator.entries.length,
			groupsCollected: accumulator.groups.size,
		});
	}

	return indexed;
}

async function collectSectionDocuments(
	section: SearchSection,
	onProgress?: (event: RebuildSearchIndexProgress) => void,
) {
	const accumulator = new SectionAccumulator();
	const indexed =
		(await indexSectionFromThumbMetaFiles(section, accumulator, onProgress)) ||
		(await indexSectionFromStoredMetaRegistry(section, accumulator, onProgress));

	return {
		indexed,
		entries: accumulator.entries.map(toTypesenseEntryDocument),
		groups: accumulator.buildGroupDocuments(),
	};
}

export function getSearchIndexPath() {
	const typesense = getTypesenseConfig();
	return typesense
		? `${typesense.baseUrl}/collections/${typesense.entriesCollection}`
		: `typesense:${DEFAULT_ENTRIES_COLLECTION}`;
}

export function closeSearchIndex() {}

export async function searchIndexExists() {
	const typesense = getTypesenseConfig();
	if (!typesense) {
		return false;
	}

	try {
		const [entries, groups] = await Promise.all([
			collectionExists(typesense.entriesCollection),
			collectionExists(typesense.groupsCollection),
		]);
		return entries && groups;
	} catch (error) {
		if (error instanceof TypesenseHttpError && error.status === 404) {
			return false;
		}
		throw error;
	}
}

export async function countSearchEntries() {
	const typesense = getTypesenseConfig();
	if (!typesense || !(await searchIndexExists())) {
		return 0;
	}

	const collection = await requestTypesenseJson<SearchResponse<Record<string, unknown>>>(
		`/collections/${encodeURIComponent(typesense.entriesCollection)}`,
	);
	return Number(collection.num_documents || 0);
}

export async function rebuildSearchIndex(
	sections: SearchSection[] = getDefaultSections(),
	options:
		| boolean
		| {
				replaceAll?: boolean;
				onProgress?: (event: RebuildSearchIndexProgress) => void;
		  } = true,
) {
	const typesense = requireTypesenseConfig();
	const replaceAll =
		typeof options === "boolean" ? options : options.replaceAll !== false;
	const onProgress = typeof options === "boolean" ? undefined : options.onProgress;

	onProgress?.({
		phase: "prepare",
		replaceAll,
	});

	if (replaceAll) {
		await Promise.all([
			dropCollection(typesense.entriesCollection),
			dropCollection(typesense.groupsCollection),
		]);
	}

	await ensureCollections();

	for (const section of sections) {
		onProgress?.({
			phase: "section-start",
			sectionId: section.id,
			sectionName: section.name,
		});
		if (!replaceAll) {
			await Promise.all([
				deleteDocumentsByFilter(
					typesense.entriesCollection,
					`section_id:=${section.id}`,
				),
				deleteDocumentsByFilter(
					typesense.groupsCollection,
					`section_id:=${section.id}`,
				),
			]);
		}

		const { indexed, entries, groups } = await collectSectionDocuments(section, onProgress);
		if (!indexed) {
			onProgress?.({
				phase: "section-complete",
				sectionId: section.id,
				sectionName: section.name,
				entriesCollected: 0,
				groupsCollected: 0,
			});
			continue;
		}

		await Promise.all([
			importDocuments(typesense.entriesCollection, entries, (documentsImported, totalDocuments, batchNumber, batchCount) =>
				onProgress?.({
					phase: "section-import",
					sectionId: section.id,
					sectionName: section.name,
					source: "stored-meta",
					documentsImported,
					totalDocuments,
					batchNumber,
					batchCount,
				}),
			),
			importDocuments(typesense.groupsCollection, groups, (documentsImported, totalDocuments, batchNumber, batchCount) =>
				onProgress?.({
					phase: "section-import",
					sectionId: section.id,
					sectionName: section.name,
					source: "thumb-meta",
					documentsImported,
					totalDocuments,
					batchNumber,
					batchCount,
				}),
			),
		]);
		onProgress?.({
			phase: "section-complete",
			sectionId: section.id,
			sectionName: section.name,
			entriesCollected: entries.length,
			groupsCollected: groups.length,
		});
	}

	return await countSearchEntries();
}

export async function upsertSearchEntryFromStoredMeta(
	section: SearchSection,
	filePath: string[],
	fileMeta: StoredDirectoryMetaEntry,
	fallbackDate?: string,
) {
	const typesense = requireTypesenseConfig();
	const normalizedFilePath = filePath.join("/");
	const entryInput = buildSearchEntryInput(
		section,
		normalizedFilePath,
		fileMeta,
		fallbackDate,
	);
	if (!entryInput) {
		return;
	}

	await ensureCollections();

	const document = toSearchEntryDocument(entryInput);
	const previousDocument = await getDocumentById<Record<string, unknown>>(
		typesense.entriesCollection,
		document.id,
	);
	const previousEntry = previousDocument
		? fromTypesenseEntryDocument(previousDocument)
		: null;

	await importDocuments(typesense.entriesCollection, [toTypesenseEntryDocument(document)]);
	await refreshGroupSummary(document.sectionId, document.groupKey);
	if (previousEntry && previousEntry.groupKey !== document.groupKey) {
		await refreshGroupSummary(previousEntry.sectionId, previousEntry.groupKey);
	}
}

export async function searchIndexedLibrary(
	query: string,
	sections: SearchSection[],
	limit = DEFAULT_GROUP_LIMIT,
): Promise<SearchResultGroup[]> {
	const normalizedQuery = normalizeQuery(query);
	if (!normalizedQuery) {
		return [];
	}

	const typesense = getTypesenseConfig();
	if (!typesense || !(await searchIndexExists())) {
		return [];
	}

	const groupedMatches = (
		await Promise.all(
			sections.map(async (section) => {
				const response = await searchCollection<Record<string, unknown>>(
					typesense.entriesCollection,
					{
						...getEntrySearchParams(normalizedQuery),
						filter_by: `section_id:=${section.id}`,
						group_by: "group_key",
						group_limit: "1",
						sort_by: "date:desc,section_name:asc,folder:asc",
						per_page: String(limit),
						page: "1",
					},
				);

				return (
					response.grouped_hits
						?.map((group) => {
							const entry = fromTypesenseEntryDocument(
								(group.hits?.[0]?.document || {}) as Record<string, unknown>,
							);
							if (!entry) {
								return null;
							}

							return {
								entry,
								matchingFileCount: Number(group.found || group.hits?.length || 0),
							};
						})
						.filter(
							(
								match,
							): match is {
								entry: SearchEntryDocument;
								matchingFileCount: number;
							} => Boolean(match),
						) || []
				);
			}),
		)
	)
		.flat()
		.sort(
			(left, right) =>
				right.entry.date.localeCompare(left.entry.date) ||
				left.entry.sectionName.localeCompare(right.entry.sectionName) ||
				left.entry.folder.localeCompare(right.entry.folder),
		)
		.slice(0, limit);

	const groupDocuments = new Map(
		(
			await Promise.all(
				groupedMatches.map(async ({ entry }) => {
					const group = await getDocumentById<SearchGroupDocument>(
						typesense.groupsCollection,
						entry.groupKey,
					);
					return group ? ([entry.groupKey, group] as const) : null;
				}),
			)
		).filter((group): group is readonly [string, SearchGroupDocument] => Boolean(group)),
	);

	return groupedMatches.map(({ entry, matchingFileCount }) =>
		toSearchResultGroup(
			entry,
			groupDocuments.get(entry.groupKey) || null,
			matchingFileCount,
		),
	);
}

export async function getIndexedMatchesForFolder(
	sectionId: number,
	folder: string,
	query: string,
) {
	const normalizedQuery = normalizeQuery(query);
	if (!normalizedQuery) {
		return null;
	}

	const typesense = getTypesenseConfig();
	if (!typesense || !(await searchIndexExists())) {
		return null;
	}

	const matches = new Set<string>();
	const folderKey = buildFolderKey(folder);
	let page = 1;

	while (true) {
		const response = await searchCollection<Record<string, unknown>>(
			typesense.entriesCollection,
			{
				...getEntrySearchParams(normalizedQuery),
				filter_by: `section_id:=${sectionId}&&folder_key:=${folderKey}`,
				sort_by: "file_name:asc",
				per_page: String(PAGE_SIZE),
				page: String(page),
			},
		);

		const documents =
			response.hits
				?.map((hit) => fromTypesenseEntryDocument(hit.document || {}))
				.filter((document): document is SearchEntryDocument => Boolean(document)) || [];
		for (const document of documents) {
			matches.add(document.fileName);
		}

		if (documents.length < PAGE_SIZE) {
			break;
		}
		page += 1;
	}

	return matches;
}
