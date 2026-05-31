"use client";

import useSWR from "swr";
import { fetcher } from "../../lib/http";
import { AppHeader } from "../_components/app-header";
import type {
	QueueCounts,
	QueueInfo,
	QueueProgressResponse,
	UISection,
} from "../_components/ui-types";
import { ErrorState, Loading, getErrorMessage } from "../_components/widget/loading";

const queueStateLabels: Array<keyof QueueCounts> = [
	"waiting",
	"active",
	"delayed",
	"paused",
	"completed",
	"failed",
];

export function QueueDashboard({
	sections,
	initialData,
}: {
	sections: UISection[];
	initialData: QueueProgressResponse;
}) {
	const { data, error, isLoading } = useSWR<QueueProgressResponse>("/api/queue-info", fetcher, {
		fallbackData: initialData,
		refreshInterval: 5_000,
		revalidateOnFocus: false,
	});

	const snapshot = data ?? initialData;
	const queue = snapshot.queue;
	const overallStats = summarizeQueue(queue);
	const perQueueStats = (queue.queues ?? []).map((singleQueue) => ({
		...singleQueue,
		stats: summarizeQueue(singleQueue),
	}));
	const contextValue = queue.configured
		? `${overallStats.totalQueued} queued across ${Math.max(queue.queues?.length ?? 0, 1)} queue${(queue.queues?.length ?? 0) === 1 ? "" : "s"}`
		: "Queue processing is not configured";

	return (
		<div className="relative overflow-hidden">
			<div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(circle_at_top,_rgba(125,211,252,0.18),_transparent_55%)]" />
			<main className="mx-auto flex min-h-screen w-full max-w-[1800px] flex-col gap-5 px-4 py-5 lg:px-6 xl:px-8">
				<AppHeader
					sections={sections}
					contextLabel="Queue dashboard"
					contextValue={contextValue}
				/>
				<section className="min-w-0 rounded-[1.75rem] border border-white/10 bg-slate-950/45 p-4 shadow-xl shadow-black/20 backdrop-blur sm:p-5">
					<div className="flex flex-col gap-4 border-b border-white/10 pb-4 lg:flex-row lg:items-end lg:justify-between">
						<div>
							<h2 className="text-2xl font-semibold text-white">Queue details</h2>
							<p className="mt-2 text-sm text-slate-400">
								Live queue snapshots for media thumbnail jobs and image description jobs.
							</p>
						</div>
						<div className="text-sm text-slate-400">
							Updated <span className="text-slate-200">{formatTimestamp(snapshot.updatedAt)}</span>
						</div>
					</div>

					{isLoading && !data ? (
						<div className="mt-5 text-sm text-slate-300">
							<Loading />
						</div>
					) : null}

					{queue.configured ? (
						<div className="mt-5 space-y-5">
							<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
								<StatCard label="Queued now" value={overallStats.totalQueued} detail="waiting + active + delayed + paused" />
								<StatCard label="Processing now" value={queue.counts.active} detail={`${queue.counts.waiting} waiting`} />
								<StatCard label="Retries delayed" value={queue.counts.delayed} detail={`${queue.counts.failed} failed overall`} />
								<StatCard label="Success rate" value={formatPercent(overallStats.successRate)} detail={`${overallStats.totalProcessed} processed`} />
							</div>

							<div className="overflow-x-auto rounded-[1.5rem] border border-white/10 bg-slate-950/50">
								<table className="min-w-full divide-y divide-white/10 text-sm">
									<thead className="bg-white/[0.04] text-xs uppercase tracking-[0.18em] text-slate-400">
										<tr>
											<th className="px-4 py-3 text-left">Queue</th>
											<th className="px-4 py-3 text-left">Configured</th>
											<th className="px-4 py-3 text-right">Queued</th>
											<th className="px-4 py-3 text-right">Active</th>
											<th className="px-4 py-3 text-right">Delayed</th>
											<th className="px-4 py-3 text-right">Paused</th>
											<th className="px-4 py-3 text-right">Completed</th>
											<th className="px-4 py-3 text-right">Failed</th>
											<th className="px-4 py-3 text-right">Processed</th>
											<th className="px-4 py-3 text-right">Success</th>
										</tr>
									</thead>
									<tbody className="divide-y divide-white/5 text-slate-200">
										<QueueRow
											label="All queues"
											configured={queue.configured}
											counts={queue.counts}
											stats={overallStats}
										/>
										{perQueueStats.map((singleQueue) => (
											<QueueRow
												key={singleQueue.label}
												label={singleQueue.label}
												configured={singleQueue.configured}
												counts={singleQueue.counts}
												stats={singleQueue.stats}
											/>
										))}
									</tbody>
								</table>
							</div>

							<div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
								<div className="overflow-x-auto rounded-[1.5rem] border border-white/10 bg-slate-950/50">
									<table className="min-w-full divide-y divide-white/10 text-sm">
										<thead className="bg-white/[0.04] text-xs uppercase tracking-[0.18em] text-slate-400">
											<tr>
												<th className="px-4 py-3 text-left">State</th>
												<th className="px-4 py-3 text-right">All queues</th>
												{perQueueStats.map((singleQueue) => (
													<th key={singleQueue.label} className="px-4 py-3 text-right">
														{singleQueue.label}
													</th>
												))}
											</tr>
										</thead>
										<tbody className="divide-y divide-white/5 text-slate-200">
											{queueStateLabels.map((state) => (
												<tr key={state}>
													<td className="px-4 py-3 font-medium capitalize text-white">{state}</td>
													<td className="px-4 py-3 text-right">{formatNumber(queue.counts[state])}</td>
													{perQueueStats.map((singleQueue) => (
														<td key={`${singleQueue.label}:${state}`} className="px-4 py-3 text-right">
															{formatNumber(singleQueue.counts[state])}
														</td>
													))}
												</tr>
											))}
										</tbody>
									</table>
								</div>

								<div className="overflow-x-auto rounded-[1.5rem] border border-white/10 bg-slate-950/50">
									<table className="min-w-full divide-y divide-white/10 text-sm">
										<thead className="bg-white/[0.04] text-xs uppercase tracking-[0.18em] text-slate-400">
											<tr>
												<th className="px-4 py-3 text-left">Queue</th>
												<th className="px-4 py-3 text-left">Name</th>
												<th className="px-4 py-3 text-left">Prefix</th>
												<th className="px-4 py-3 text-left">Connection</th>
											</tr>
										</thead>
										<tbody className="divide-y divide-white/5 text-slate-200">
											{perQueueStats.map((singleQueue) => (
												<tr key={`${singleQueue.label}:config`}>
													<td className="px-4 py-3 font-medium capitalize text-white">{singleQueue.label}</td>
													<td className="px-4 py-3">{singleQueue.name}</td>
													<td className="px-4 py-3">{singleQueue.prefix}</td>
													<td className="px-4 py-3 text-slate-300">
														<div className="max-w-[28rem] break-all">
															{singleQueue.connectionUrl ?? "Not configured"}
														</div>
													</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							</div>

							{error ? (
								<ErrorState
									message="Showing the last queue snapshot."
									error={error}
									details={getErrorMessage(error) ?? "Refresh failed."}
								/>
							) : null}
						</div>
					) : (
						<div className="mt-5 rounded-[1.5rem] border border-dashed border-white/10 bg-slate-900/40 px-6 py-10 text-center">
							<h3 className="text-xl font-semibold text-white">Queues are disabled</h3>
							<p className="mt-3 text-sm leading-6 text-slate-400">
								Set the BullMQ connection environment variables to enable the media and
								description workers, then revisit this page.
							</p>
							{error ? (
								<div className="mt-5 text-left">
									<ErrorState
										message="Queue refresh failed."
										error={error}
										details={getErrorMessage(error) ?? "Refresh failed."}
									/>
								</div>
							) : null}
						</div>
					)}
				</section>
			</main>
		</div>
	);
}

function summarizeQueue(queue: Pick<QueueInfo, "counts" | "totalQueued" | "totalProcessed"> | {
	counts: QueueCounts;
}) {
	const totalQueued =
		"totalQueued" in queue
			? queue.totalQueued
			: queue.counts.waiting + queue.counts.active + queue.counts.delayed + queue.counts.paused;
	const totalProcessed =
		"totalProcessed" in queue
			? queue.totalProcessed
			: queue.counts.completed + queue.counts.failed;
	const successRate = totalProcessed > 0 ? (queue.counts.completed / totalProcessed) * 100 : null;
	return {
		totalQueued,
		totalProcessed,
		successRate,
	};
}

function QueueRow({
	label,
	configured,
	counts,
	stats,
}: {
	label: string;
	configured: boolean;
	counts: QueueCounts;
	stats: ReturnType<typeof summarizeQueue>;
}) {
	return (
		<tr>
			<td className="px-4 py-3 font-medium capitalize text-white">{label}</td>
			<td className="px-4 py-3">{configured ? "Yes" : "No"}</td>
			<td className="px-4 py-3 text-right">{formatNumber(stats.totalQueued)}</td>
			<td className="px-4 py-3 text-right">{formatNumber(counts.active)}</td>
			<td className="px-4 py-3 text-right">{formatNumber(counts.delayed)}</td>
			<td className="px-4 py-3 text-right">{formatNumber(counts.paused)}</td>
			<td className="px-4 py-3 text-right">{formatNumber(counts.completed)}</td>
			<td className="px-4 py-3 text-right">{formatNumber(counts.failed)}</td>
			<td className="px-4 py-3 text-right">{formatNumber(stats.totalProcessed)}</td>
			<td className="px-4 py-3 text-right">{formatPercent(stats.successRate)}</td>
		</tr>
	);
}

function StatCard({
	label,
	value,
	detail,
}: {
	label: string;
	value: number | string;
	detail: string;
}) {
	return (
		<div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4 shadow-xl shadow-black/20">
			<p className="text-xs uppercase tracking-[0.18em] text-slate-400">{label}</p>
			<p className="mt-3 text-3xl font-semibold text-white">
				{typeof value === "number" ? formatNumber(value) : value}
			</p>
			<p className="mt-2 text-sm text-slate-400">{detail}</p>
		</div>
	);
}

function formatNumber(value: number) {
	return new Intl.NumberFormat().format(value);
}

function formatPercent(value: number | null) {
	if (value === null || Number.isNaN(value)) {
		return "--";
	}
	return `${value.toFixed(1)}%`;
}

function formatTimestamp(value: string) {
	return new Intl.DateTimeFormat(undefined, {
		dateStyle: "medium",
		timeStyle: "medium",
	}).format(new Date(value));
}
