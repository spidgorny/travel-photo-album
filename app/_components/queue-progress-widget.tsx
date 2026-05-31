"use client";

import { useRef } from "react";
import useSWR from "swr";
import { fetcher } from "../../lib/http";
import type { QueueProgressResponse } from "./ui-types";
import { ErrorState, Loading, getErrorMessage } from "./widget/loading";

export function QueueProgressWidget() {
	const { data, error, isLoading, mutate } = useSWR<QueueProgressResponse>("/api/queue-info", fetcher, {
		refreshInterval: 10_000,
		revalidateOnFocus: false,
	});

	const totalObservedRef = useRef(0);
	const processedObservedRef = useRef(0);
	const previousQueuedRef = useRef(0);

	if (error && !data) {
		return (
			<div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 lg:w-[19rem] lg:shrink-0">
				<div className="text-xs uppercase tracking-[0.2em] text-slate-400">Queue progress</div>
				<div className="mt-3">
					<ErrorState
						message="Failed to load queue progress."
						error={error}
						details={getErrorMessage(error)}
						onRetry={() => mutate()}
					/>
				</div>
			</div>
		);
	}

	if (isLoading && !data) {
		return (
			<div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 lg:w-[19rem] lg:shrink-0">
				<div className="text-xs uppercase tracking-[0.2em] text-slate-400">Queue progress</div>
				<div className="mt-3 text-sm text-slate-300">
					<Loading />
				</div>
			</div>
		);
	}

	if (!data?.queue.configured) {
		return (
			<div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 lg:w-[19rem] lg:shrink-0">
				<div className="text-xs uppercase tracking-[0.2em] text-slate-400">Queue progress</div>
				<div className="mt-2 text-sm font-medium text-slate-300">Queue disabled</div>
			</div>
		);
	}

	const queuedNow = data.queue.totalQueued;
	if (previousQueuedRef.current === 0 && queuedNow > 0) {
		totalObservedRef.current = queuedNow;
		processedObservedRef.current = 0;
	} else if (queuedNow > previousQueuedRef.current) {
		totalObservedRef.current += queuedNow - previousQueuedRef.current;
	} else if (queuedNow < previousQueuedRef.current) {
		processedObservedRef.current = Math.min(
			totalObservedRef.current,
			processedObservedRef.current + (previousQueuedRef.current - queuedNow),
		);
	}
	if (queuedNow === 0 && previousQueuedRef.current > 0) {
		processedObservedRef.current = totalObservedRef.current;
	}
	previousQueuedRef.current = queuedNow;

	const totalObserved = totalObservedRef.current;
	const processed = processedObservedRef.current;
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
			{error ? (
				<div className="mt-3">
					<ErrorState
						message="Showing the last queue snapshot."
						error={error}
						details={getErrorMessage(error) ?? "Refresh failed."}
						onRetry={() => mutate()}
					/>
				</div>
			) : null}
		</div>
	);
}
