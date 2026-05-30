"use client";

import useSWR from "swr";
import { fetcher } from "../../lib/http";
import { GalleryOneDay } from "./gallery-one-day";
import type { DatesResponse, UISection } from "./ui-types";
import { Loading } from "./widget/loading";

interface GalleryForProps {
	section: UISection;
	folder?: string;
}

export function GalleryFor({ section, folder = "" }: GalleryForProps) {
	const apiUrl = `/api/dates/${section.id}/${folder}`;
	const { data } = useSWR<DatesResponse>(apiUrl, fetcher);

	if (!data) {
		return (
			<div className="flex min-h-[16rem] items-center justify-center rounded-[1.5rem] border border-dashed border-white/10 bg-slate-900/40">
				<Loading />
			</div>
		);
	}

	const dates = Object.entries(data.dates ?? {}).sort(([firstDate], [secondDate]) =>
		secondDate.localeCompare(firstDate),
	);
	const isSSR = typeof window === "undefined";

	if (!dates.length) {
		return (
			<div className="flex min-h-[16rem] items-center justify-center rounded-[1.5rem] border border-dashed border-white/10 bg-slate-900/40 px-6 text-center text-sm text-slate-400">
				No dated photos were found in this folder yet.
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<div className="flex flex-col gap-2 border-b border-white/10 pb-4 sm:flex-row sm:items-end sm:justify-between">
				<div>
					<h2 className="text-2xl font-semibold text-white">Photo timeline</h2>
					<p className="text-sm text-slate-400">
						Photos are grouped by capture day for quick scanning.
					</p>
				</div>
				<div className="text-sm text-slate-400">
					{dates.length} day{dates.length === 1 ? "" : "s"}
				</div>
			</div>
			{dates.map(([date, count]) => (
				<section
					key={date}
					className="rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-4 shadow-lg shadow-black/20"
				>
					<div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<h3 className="text-xl font-semibold text-white">{date}</h3>
							<p className="text-sm text-slate-400">
								{count} photo{count === 1 ? "" : "s"}
							</p>
						</div>
					</div>
					{!isSSR && <GalleryOneDay sectionId={section.id} folder={folder} date={date} />}
				</section>
			))}
		</div>
	);
}
