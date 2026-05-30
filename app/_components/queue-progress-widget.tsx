"use client";

import { useRef } from "react";
import useSWR from "swr";
import { fetcher } from "../../lib/http";
import type { AppInfoResponse } from "./ui-types";

export function QueueProgressWidget() {
	const { data } = useSWR<AppInfoResponse>("/api/info", fetcher, {
		refreshInterval: 10_000,
		revalidateOnFocus: false,
	});

	const baselineProcessedRef = useRef<number | null>(null);
	const totalObservedRef = useRef(0);
	const previousQueuedRef = useRef(0);

	if (!data?.queue.configured) {
		return (
			<div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 lg:w-[19rem] lg:shrink-0">
				<div className="text-xs uppercase tracking-[0.2em] text-slate-400">Queue progress</div>
				<div className="mt-2 text-sm font-medium text-slate-300">Queue disabled</div>
			</div>
		);
	}

	const queuedNow = data.queue.totalQueued;
	if (baselineProcessedRef.current === null) {
		baselineProcessedRef.current = data.queue.totalProcessed;
	}
	if (previousQueuedRef.current === 0 && queuedNow > 0) {
		baselineProcessedRef.current = data.queue.totalProcessed;
		totalObservedRef.current = queuedNow;
	}

	const processed = Math.max(0, data.queue.totalProcessed - (baselineProcessedRef.current ?? 0));
	totalObservedRef.current = Math.max(totalObservedRef.current, processed + queuedNow);
	previousQueuedRef.current = queuedNow;

	const totalObserved = totalObservedRef.current;
	const percentDone = totalObserved > 0 ? Math.min(100, (processed / totalObserved) * 100) : 100;

	return (
		<div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 lg:w-[19rem] lg:shrink-0">
			<div className="flex items-center justify-between gap-3">
				<div className="text-xs uppercase tracking-[0.2em] text-slate-400">Queue progress</div>
				<div className="text-xs font-medium text-sky-100">{percentDone.toFixed(1)}%</div>
			</div>
			<div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
				<div
					className="h-full rounded-full bg-gradient-to-r from-sky-400 via-cyan-300 to-emerald-300 transition-[width] duration-500"
					style={{ width: `${percentDone}%` }}
				/>
			</div>
			<div className="mt-3 flex items-center justify-between gap-3 text-sm">
				<div className="font-medium text-white">{queuedNow} left</div>
				<div className="text-slate-400">
					{processed}/{totalObserved || processed}
				</div>
			</div>
		</div>
	);
}
