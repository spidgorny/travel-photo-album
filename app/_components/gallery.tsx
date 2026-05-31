"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { fetcher } from "../../lib/http";
import { FolderInfoSidebar } from "./folder-info-sidebar";
import { GalleryOneDay } from "./gallery-one-day";
import { buildDayAnchorId, createGoogleMapsHref } from "./url-paths";
import type { DatesResponse, DaySummary, UISection } from "./ui-types";
import { ErrorState, Loading, getErrorMessage } from "./widget/loading";

interface GalleryForProps {
	section: UISection;
	folder?: string;
}

export function GalleryFor({ section, folder = "" }: GalleryForProps) {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const requestedPage = normalizePageNumber(searchParams.get("page"));
	const apiUrl =
		requestedPage > 1
			? `/api/dates/${section.id}/${folder}?page=${requestedPage}`
			: `/api/dates/${section.id}/${folder}`;
	const { data, error, mutate } = useSWR<DatesResponse>(apiUrl, fetcher);
	const [isFolderInfoOpen, setIsFolderInfoOpen] = useState(false);

	if (error && !data) {
		return (
			<div className="flex min-h-[16rem] items-center justify-center rounded-[1.5rem] border border-dashed border-white/10 bg-slate-900/40 p-4">
				<ErrorState
					message="Failed to load the gallery timeline."
					error={error}
					details={getErrorMessage(error)}
					onRetry={() => mutate()}
				/>
			</div>
		);
	}

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
	const undated = normalizeDaySummary(data.undated);
	const jumpLabelMode = getJumpLabelMode(dates.map(({ date }) => date));
	const pagination = data.pagination ?? {
		page: 1,
		totalPages: 1,
		totalFiles: dates.reduce((total, day) => total + day.count, 0) + undated.count,
		totalDays: dates.length,
		pageFiles: dates.reduce((total, day) => total + day.count, 0) + undated.count,
		pageDays: dates.length,
		perPageFileLimit: 1000,
		hasPreviousPage: false,
		hasNextPage: false,
	};
	const isSSR = typeof window === "undefined";

	if (!dates.length && !undated.count) {
		return (
			<div className="flex min-h-[16rem] items-center justify-center rounded-[1.5rem] border border-dashed border-white/10 bg-slate-900/40 px-6 text-center text-sm text-slate-400">
				No dated photos were found in this folder yet.
			</div>
		);
	}

	return (
		<div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_5.5rem]">
			<FolderInfoSidebar
				isOpen={isFolderInfoOpen}
				onClose={() => setIsFolderInfoOpen(false)}
				sectionId={section.id}
				collectionName={section.name}
				folder={folder}
			/>
			<div className="space-y-6">
				{error ? (
					<ErrorState
						message="Showing the last loaded gallery timeline."
						error={error}
						details={getErrorMessage(error)}
						onRetry={() => mutate()}
					/>
				) : null}
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
					</div>
					<div className="text-sm text-slate-400">
						{pagination.totalPages > 1
							? `${pagination.pageDays} day${pagination.pageDays === 1 ? "" : "s"} on this page`
							: `${dates.length} day${dates.length === 1 ? "" : "s"}${undated.count ? " + undated" : ""}`}
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
					const anchorId = buildDayAnchorId(date);
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
								</div>
								{locations.length ? (
									<div className="flex flex-wrap gap-2 sm:justify-end">
										{locations.slice(0, MAX_LOCATION_LABELS).map((location) => (
											<a
												key={`${date}:${location}`}
												href={createGoogleMapsHref(location)}
												target="_blank"
												rel="noreferrer"
												className="rounded-full border border-sky-300/20 bg-sky-300/10 px-2.5 py-1 text-xs font-medium text-sky-100 transition hover:border-sky-200/40 hover:bg-sky-300/20 hover:text-white"
											>
												{location}
											</a>
										))}
										{locations.length > MAX_LOCATION_LABELS ? (
											<span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-medium text-slate-300">
												+{locations.length - MAX_LOCATION_LABELS} more
											</span>
										) : null}
									</div>
								) : null}
							</div>
							{!isSSR && (
								<GalleryOneDay
									sectionId={section.id}
									folder={folder}
									date={date}
								/>
							)}
						</section>
					);
				})}
				{undated.count ? (
					<section
						id={buildDayAnchorId(UNDATED_BUCKET)}
						key={UNDATED_BUCKET}
						className="scroll-mt-6 rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-4 shadow-lg shadow-black/20"
					>
						<div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
							<div>
								<h3 className="text-xl font-semibold text-white">Undated photos</h3>
								<p className="text-sm text-slate-400">
									{undated.count} photo{undated.count === 1 ? "" : "s"}
								</p>
							</div>
						</div>
						{!isSSR && (
							<GalleryOneDay
								sectionId={section.id}
								folder={folder}
								date={UNDATED_BUCKET}
							/>
						)}
					</section>
				) : null}
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

			<aside className="hidden self-start xl:sticky xl:top-5 xl:block">
				<div className="max-h-[calc(100vh-2.5rem)] overflow-y-auto rounded-[1.25rem] border border-white/10 bg-slate-950/55 p-2 shadow-xl shadow-black/20">
					<div className="px-1.5 pb-2">
						<div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
							Days
						</div>
						<div className="mt-1 text-xs text-slate-500">Jump to a date</div>
					</div>
					<nav aria-label="Jump to day" className="space-y-1.5">
						{dates.map(({ date, count }) => (
							<a
								key={`jump:${date}`}
								href={`#${buildDayAnchorId(date)}`}
								className="flex items-center justify-between gap-1 rounded-xl border border-white/8 bg-white/[0.03] px-2 py-1.5 text-xs text-slate-300 transition hover:border-sky-300/30 hover:bg-sky-300/10 hover:text-white"
							>
								<span className="font-medium leading-tight">
									{formatDateJumpLabel(date, jumpLabelMode)}
								</span>
								<span className="text-[11px] text-slate-500">{count}</span>
							</a>
						))}
						{undated.count ? (
							<a
								key="jump:undated"
								href={`#${buildDayAnchorId(UNDATED_BUCKET)}`}
								className="flex items-center justify-between gap-1 rounded-xl border border-white/8 bg-white/[0.03] px-2 py-1.5 text-xs text-slate-300 transition hover:border-sky-300/30 hover:bg-sky-300/10 hover:text-white"
							>
								<span className="font-medium leading-tight">Undated</span>
								<span className="text-[11px] text-slate-500">{undated.count}</span>
							</a>
						) : null}
					</nav>
				</div>
			</aside>
		</div>
	);
}

const MAX_LOCATION_LABELS = 3;
const VISIBLE_PAGINATION_RADIUS = 1;
const UNDATED_BUCKET = "undated";

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

function formatDateJumpLabel(date: string, mode: "day" | "month-day" | "month-day-year") {
	const parsedDate = parseJumpDate(date);
	if (!parsedDate) {
		return date;
	}

	if (mode === "day") {
		return String(parsedDate.getDate());
	}

	if (mode === "month-day-year") {
		return new Intl.DateTimeFormat("en", {
			month: "short",
			day: "numeric",
			year: "2-digit",
		}).format(parsedDate);
	}

	return new Intl.DateTimeFormat("en", {
		month: "short",
		day: "numeric",
	}).format(parsedDate);
}

function getJumpLabelMode(dates: string[]) {
	const parsedDates = dates.map(parseJumpDate).filter((date): date is Date => Boolean(date));
	if (!parsedDates.length) {
		return "day" as const;
	}

	const uniqueMonths = new Set(
		parsedDates.map((date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`),
	);
	if (uniqueMonths.size <= 1) {
		return "day" as const;
	}

	const uniqueYears = new Set(parsedDates.map((date) => date.getFullYear()));
	return uniqueYears.size > 1 ? "month-day-year" : ("month-day" as const);
}

function parseJumpDate(date: string) {
	const isoMatch = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (isoMatch) {
		return new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
	}

	const compactMatch = date.match(/^(\d{4})(\d{2})(\d{2})$/);
	if (compactMatch) {
		return new Date(Number(compactMatch[1]), Number(compactMatch[2]) - 1, Number(compactMatch[3]));
	}

	return null;
}

function normalizePageNumber(pageInput: string | null) {
	const page = Number.parseInt(pageInput ?? "", 10);
	return Number.isInteger(page) && page > 0 ? page : 1;
}

function createGalleryPageHref({
	pathname,
	searchParams,
	page,
}: {
	pathname: string;
	searchParams: ReturnType<typeof useSearchParams>;
	page: number;
}) {
	const nextSearchParams = new URLSearchParams(searchParams.toString());
	if (page <= 1) {
		nextSearchParams.delete("page");
	} else {
		nextSearchParams.set("page", String(page));
	}
	nextSearchParams.delete("q");
	const queryString = nextSearchParams.toString();
	return queryString ? `${pathname}?${queryString}` : pathname;
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
