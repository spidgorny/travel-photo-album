"use client";

import { useState } from "react";
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
	const apiUrl = `/api/dates/${section.id}/${folder}`;
	const { data } = useSWR<DatesResponse>(apiUrl, fetcher);
	const [isFolderInfoOpen, setIsFolderInfoOpen] = useState(false);

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
	const isSSR = typeof window === "undefined";

	if (!dates.length) {
		return (
			<div className="flex min-h-[16rem] items-center justify-center rounded-[1.5rem] border border-dashed border-white/10 bg-slate-900/40 px-6 text-center text-sm text-slate-400">
				No dated photos were found in this folder yet.
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
					</div>
					<div className="text-sm text-slate-400">
						{dates.length} day{dates.length === 1 ? "" : "s"}
					</div>
				</div>
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
							{!isSSR && <GalleryOneDay sectionId={section.id} folder={folder} date={date} />}
						</section>
					);
				})}
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
	if (!/^\d{8}$/.test(date)) {
		return date;
	}

	return `${date.slice(4, 6)}-${date.slice(6, 8)}`;
}
