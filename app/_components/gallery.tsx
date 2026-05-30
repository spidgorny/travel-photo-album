"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { fetcher } from "../../lib/http";
import { FolderInfoSidebar } from "./folder-info-sidebar";
import { GalleryOneDay } from "./gallery-one-day";
import type { DatesResponse, DaySummary, UISection } from "./ui-types";
import { Loading } from "./widget/loading";

interface GalleryForProps {
	section: UISection;
	folder?: string;
}

export function GalleryFor({ section, folder = "" }: GalleryForProps) {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const requestedPage = normalizePageNumber(searchParams.get("page"));
	const searchQuery = normalizeSearchQuery(searchParams.get("q"));
	const [searchInput, setSearchInput] = useState(searchQuery);
	const apiUrl =
		requestedPage > 1
			? `/api/dates/${section.id}/${folder}?page=${requestedPage}${searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : ""}`
			: `/api/dates/${section.id}/${folder}${searchQuery ? `?q=${encodeURIComponent(searchQuery)}` : ""}`;
	const { data } = useSWR<DatesResponse>(apiUrl, fetcher);
	const [isFolderInfoOpen, setIsFolderInfoOpen] = useState(false);

	useEffect(() => {
		setSearchInput(searchQuery);
	}, [searchQuery]);

	if (!data) {
		return (
			<div className="flex min-h-[16rem] items-center justify-center rounded-[1.5rem] border border-dashed border-white/10 bg-slate-900/40">
				<Loading />
			</div>
		);
	}

	const dates = Object.entries(data.dates ?? {})
		.map(([date, summary]) => ({
			date,
			...normalizeDaySummary(summary),
		}))
		.sort(({ date: firstDate }, { date: secondDate }) => secondDate.localeCompare(firstDate));
	const pagination = data.pagination ?? {
		page: 1,
		totalPages: 1,
		totalFiles: dates.reduce((total, day) => total + day.count, 0),
		totalDays: dates.length,
		pageFiles: dates.reduce((total, day) => total + day.count, 0),
		pageDays: dates.length,
		perPageFileLimit: 1000,
		hasPreviousPage: false,
		hasNextPage: false,
	};
	const isSSR = typeof window === "undefined";

	if (!dates.length) {
		return (
			<div className="flex min-h-[16rem] items-center justify-center rounded-[1.5rem] border border-dashed border-white/10 bg-slate-900/40 px-6 text-center text-sm text-slate-400">
				{searchQuery
					? "No photos matched this description search in the current folder."
					: "No dated photos were found in this folder yet."}
			</div>
		);
	}

	return (
		<div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_7rem]">
			<FolderInfoSidebar
				isOpen={isFolderInfoOpen}
				onClose={() => setIsFolderInfoOpen(false)}
				sectionId={section.id}
				collectionName={section.name}
				folder={folder}
			/>
			<div className="space-y-6">
				<div className="flex flex-col gap-2 border-b border-white/10 pb-4 sm:flex-row sm:items-end sm:justify-between">
					<div>
						<div className="flex flex-wrap items-center gap-3">
							<h2 className="text-2xl font-semibold text-white">Photo timeline</h2>
							<button
								type="button"
								onClick={() => setIsFolderInfoOpen(true)}
								className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-slate-200 transition hover:border-sky-300/30 hover:text-white"
							>
								<span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-sky-300/30 bg-sky-300/10 text-[11px] text-sky-100">
									i
								</span>
								Folder info
							</button>
						</div>
						<p className="text-sm text-slate-400">
							Photos are grouped by capture day for quick scanning.
						</p>
						<div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
							<input
								type="search"
								value={searchInput}
								onChange={(event) => setSearchInput(event.target.value)}
								onKeyDown={(event) => {
									if (event.key === "Enter") {
										router.push(
											createGalleryPageHref({
												pathname,
												searchParams,
												page: 1,
												searchQuery: searchInput,
											}),
										);
									}
								}}
								placeholder="Search image descriptions"
								className="w-full rounded-2xl border border-white/10 bg-slate-900/90 px-4 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-sky-300/50 sm:max-w-sm"
							/>
							<div className="flex items-center gap-2">
								<button
									type="button"
									onClick={() =>
										router.push(
											createGalleryPageHref({
												pathname,
												searchParams,
												page: 1,
												searchQuery: searchInput,
											}),
										)
									}
									className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm text-slate-200 transition hover:border-sky-300/30 hover:text-white"
								>
									Search
								</button>
								{searchQuery ? (
									<button
										type="button"
										onClick={() =>
											router.push(
												createGalleryPageHref({
													pathname,
													searchParams,
													page: 1,
													searchQuery: "",
												}),
											)
										}
										className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm text-slate-300 transition hover:border-white/20 hover:text-white"
									>
										Clear
									</button>
								) : null}
							</div>
						</div>
					</div>
					<div className="text-sm text-slate-400">
						{pagination.totalPages > 1
							? `${pagination.pageDays} day${pagination.pageDays === 1 ? "" : "s"} on this page`
							: `${dates.length} day${dates.length === 1 ? "" : "s"}`}
					</div>
				</div>
				{pagination.totalPages > 1 ? (
					<GalleryPagination
						currentPage={pagination.page}
						totalPages={pagination.totalPages}
						pageFiles={pagination.pageFiles}
						totalFiles={pagination.totalFiles}
						onPageChange={(page) =>
							router.push(createGalleryPageHref({ pathname, searchParams, page }))
						}
					/>
				) : null}
				{dates.map(({ date, count, locations }) => {
					const anchorId = getDayAnchorId(date);
					return (
						<section
							id={anchorId}
							key={date}
							className="scroll-mt-6 rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-4 shadow-lg shadow-black/20"
						>
							<div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
								<div>
									<h3 className="text-xl font-semibold text-white">{date}</h3>
									<p className="text-sm text-slate-400">
										{count} photo{count === 1 ? "" : "s"}
									</p>
									{locations.length ? (
										<div className="mt-2 flex flex-wrap gap-2">
											{locations.slice(0, MAX_LOCATION_LABELS).map((location) => (
												<span
													key={`${date}:${location}`}
													className="rounded-full border border-sky-300/20 bg-sky-300/10 px-2.5 py-1 text-xs font-medium text-sky-100"
												>
													{location}
												</span>
											))}
											{locations.length > MAX_LOCATION_LABELS ? (
												<span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-medium text-slate-300">
													+{locations.length - MAX_LOCATION_LABELS} more
												</span>
											) : null}
										</div>
									) : null}
								</div>
							</div>
							{!isSSR && (
								<GalleryOneDay
									sectionId={section.id}
									folder={folder}
									date={date}
									searchQuery={searchQuery}
								/>
							)}
						</section>
					);
				})}
				{pagination.totalPages > 1 ? (
					<GalleryPagination
						currentPage={pagination.page}
						totalPages={pagination.totalPages}
						pageFiles={pagination.pageFiles}
						totalFiles={pagination.totalFiles}
						onPageChange={(page) =>
							router.push(createGalleryPageHref({ pathname, searchParams, page }))
						}
					/>
				) : null}
			</div>

			<aside className="hidden xl:block">
				<div className="rounded-[1.5rem] border border-white/10 bg-slate-950/55 p-3 shadow-xl shadow-black/20">
					<div className="px-2 pb-3">
						<div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
							Days
						</div>
						<div className="mt-2 text-sm text-slate-500">Jump to a date</div>
					</div>
					<nav aria-label="Jump to day" className="space-y-2">
						{dates.map(({ date, count }) => (
							<a
								key={`jump:${date}`}
								href={`#${getDayAnchorId(date)}`}
								className="flex items-center justify-between rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2 text-sm text-slate-300 transition hover:border-sky-300/30 hover:bg-sky-300/10 hover:text-white"
							>
								<span className="font-medium">{formatDateJumpLabel(date)}</span>
								<span className="text-xs text-slate-500">{count}</span>
							</a>
						))}
					</nav>
				</div>
			</aside>
		</div>
	);
}

const MAX_LOCATION_LABELS = 3;
const VISIBLE_PAGINATION_RADIUS = 1;

interface GalleryPaginationProps {
	currentPage: number;
	totalPages: number;
	pageFiles: number;
	totalFiles: number;
	onPageChange: (page: number) => void;
}

function GalleryPagination({
	currentPage,
	totalPages,
	pageFiles,
	totalFiles,
	onPageChange,
}: GalleryPaginationProps) {
	const pageItems = getVisiblePageItems(currentPage, totalPages);

	return (
		<nav
			aria-label="Gallery pages"
			className="flex flex-col gap-3 rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4 sm:flex-row sm:items-center sm:justify-between"
		>
			<div className="text-sm text-slate-400">
				Page {currentPage} of {totalPages} · {pageFiles.toLocaleString()} photo
				{pageFiles === 1 ? "" : "s"} on this page · {totalFiles.toLocaleString()} total
			</div>
			<div className="flex flex-wrap items-center gap-2">
				<button
					type="button"
					onClick={() => onPageChange(currentPage - 1)}
					disabled={currentPage <= 1}
					className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm text-slate-200 transition hover:border-sky-300/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
				>
					Newer
				</button>
				{pageItems.map((item, index) =>
					item === "gap" ? (
						<span
							key={`gap:${currentPage}:${index}`}
							className="px-1 text-sm text-slate-500"
						>
							...
						</span>
					) : (
						<button
							key={item}
							type="button"
							onClick={() => onPageChange(item)}
							aria-current={item === currentPage ? "page" : undefined}
							className={[
								"rounded-full border px-3 py-1.5 text-sm transition",
								item === currentPage
									? "border-sky-300/40 bg-sky-300/10 text-white"
									: "border-white/10 bg-white/[0.04] text-slate-200 hover:border-sky-300/30 hover:text-white",
							].join(" ")}
						>
							{item}
						</button>
					),
				)}
				<button
					type="button"
					onClick={() => onPageChange(currentPage + 1)}
					disabled={currentPage >= totalPages}
					className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm text-slate-200 transition hover:border-sky-300/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
				>
					Older
				</button>
			</div>
		</nav>
	);
}

function normalizeDaySummary(summary: number | DaySummary | undefined) {
	if (typeof summary === "number") {
		return { count: summary, locations: [] as string[] };
	}

	if (!summary || typeof summary !== "object") {
		return { count: 0, locations: [] as string[] };
	}

	return {
		count: typeof summary.count === "number" ? summary.count : 0,
		locations: Array.isArray(summary.locations)
			? summary.locations.filter((location): location is string => typeof location === "string" && !!location)
			: [],
	};
}

function getDayAnchorId(date: string) {
	return `day-${date}`;
}

function formatDateJumpLabel(date: string) {
	const compactMatch = date.match(/^\d{4}\d{2}(\d{2})$/);
	if (compactMatch) {
		return String(Number(compactMatch[1]));
	}

	const isoMatch = date.match(/^\d{4}-\d{2}-(\d{2})$/);
	if (isoMatch) {
		return String(Number(isoMatch[1]));
	}

	return date;
}

function normalizePageNumber(pageInput: string | null) {
	const page = Number.parseInt(pageInput ?? "", 10);
	return Number.isInteger(page) && page > 0 ? page : 1;
}

function createGalleryPageHref({
	pathname,
	searchParams,
	page,
	searchQuery,
}: {
	pathname: string;
	searchParams: ReturnType<typeof useSearchParams>;
	page: number;
	searchQuery?: string;
}) {
	const nextSearchParams = new URLSearchParams(searchParams.toString());
	if (page <= 1) {
		nextSearchParams.delete("page");
	} else {
		nextSearchParams.set("page", String(page));
	}
	const normalizedSearchQuery = normalizeSearchQuery(searchQuery ?? nextSearchParams.get("q"));
	if (normalizedSearchQuery) {
		nextSearchParams.set("q", normalizedSearchQuery);
	} else {
		nextSearchParams.delete("q");
	}
	const queryString = nextSearchParams.toString();
	return queryString ? `${pathname}?${queryString}` : pathname;
}

function normalizeSearchQuery(value: string | null | undefined) {
	return value?.trim() ?? "";
}

function getVisiblePageItems(currentPage: number, totalPages: number) {
	const pages = new Set<number>([1, totalPages]);

	for (
		let page = Math.max(1, currentPage - VISIBLE_PAGINATION_RADIUS);
		page <= Math.min(totalPages, currentPage + VISIBLE_PAGINATION_RADIUS);
		page += 1
	) {
		pages.add(page);
	}

	const sortedPages = Array.from(pages).sort((firstPage, secondPage) => firstPage - secondPage);
	const items: Array<number | "gap"> = [];

	for (const page of sortedPages) {
		const previousPage = items.at(-1);
		if (typeof previousPage === "number" && page - previousPage > 1) {
			items.push("gap");
		}
		items.push(page);
	}

	return items;
}
