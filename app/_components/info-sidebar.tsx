"use client";

import { useEffect } from "react";
import useSWR from "swr";
import { fetcher } from "../../lib/http";
import type { AppInfoResponse } from "./ui-types";
import { ErrorState, Loading, getErrorMessage } from "./widget/loading";

interface InfoSidebarProps {
	isOpen: boolean;
	onClose: () => void;
	activeCollection?: string;
	activeFolder?: string;
}

export function InfoSidebar({
	isOpen,
	onClose,
	activeCollection,
	activeFolder,
}: InfoSidebarProps) {
	const { data, error, isLoading, mutate } = useSWR<AppInfoResponse>(
		isOpen ? "/api/info" : null,
		fetcher,
	);

	useEffect(() => {
		if (!isOpen) {
			return;
		}

		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				onClose();
			}
		};

		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [isOpen, onClose]);

	return (
		<div
			className={`fixed inset-0 z-50 overflow-hidden transition ${
				isOpen ? "pointer-events-auto" : "pointer-events-none"
			}`}
			aria-hidden={!isOpen}
		>
			<button
				type="button"
				onClick={onClose}
				className={`absolute inset-0 bg-slate-950/70 transition-opacity duration-300 ${
					isOpen ? "opacity-100" : "opacity-0"
				}`}
				aria-label="Close information sidebar"
			/>
			<aside
				className={`absolute inset-y-0 right-0 flex w-full max-w-xl flex-col border-l border-white/10 bg-slate-950/95 shadow-2xl shadow-black/50 backdrop-blur-xl transition-transform duration-300 ${
					isOpen ? "translate-x-0" : "translate-x-[calc(100%+2rem)]"
				}`}
			>
				<div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
					<div>
						<p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-200">
							System info
						</p>
						<h2 className="mt-2 text-2xl font-semibold text-white">
							Queue and thumbnail storage
						</h2>
						<p className="mt-2 text-sm leading-6 text-slate-400">
							Check queue throughput, current workload, and thumbnail storage usage
							without leaving the gallery.
						</p>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-lg text-slate-200 transition hover:border-sky-300/30 hover:text-white"
						aria-label="Close information sidebar"
					>
						×
					</button>
				</div>

				<div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
					<section className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
						<p className="text-xs uppercase tracking-[0.22em] text-slate-400">Current view</p>
						<div className="mt-3 space-y-3 text-sm text-slate-200">
							<div>
								<div className="text-slate-400">Collection</div>
								<div className="mt-1 font-medium text-white">
									{activeCollection || "No collection selected"}
								</div>
							</div>
							<div>
								<div className="text-slate-400">Folder</div>
								<div className="mt-1 break-all font-medium text-white">
									{activeFolder || "/"}
								</div>
							</div>
						</div>
					</section>

					{isLoading && !error && !data ? (
						<div className="flex min-h-[16rem] items-center justify-center rounded-[1.5rem] border border-dashed border-white/10 bg-slate-900/40">
							<Loading />
						</div>
					) : null}

					{error ? (
						<ErrorState
							message="Failed to load system info."
							error={error}
							details={getErrorMessage(error)}
							onRetry={() => mutate()}
						/>
					) : null}

					{data ? (
						<>
							<section className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
								<div className="flex items-start justify-between gap-3">
									<div>
										<p className="text-xs uppercase tracking-[0.22em] text-slate-400">
											Queue
										</p>
										<h3 className="mt-2 text-xl font-semibold text-white">
											{data.queue.name}
										</h3>
									</div>
									<span className="rounded-full border border-sky-300/20 bg-sky-300/10 px-2.5 py-1 text-xs font-medium text-sky-100">
										{data.queue.configured ? "Connected" : "Disabled"}
									</span>
								</div>
								<div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
									<MetricCard label="Queued now" value={data.queue.totalQueued} />
									<MetricCard label="Processed" value={data.queue.totalProcessed} />
									<MetricCard label="Failed" value={data.queue.counts.failed} />
									<MetricCard label="Waiting" value={data.queue.counts.waiting} />
									<MetricCard label="Active" value={data.queue.counts.active} />
									<MetricCard label="Delayed" value={data.queue.counts.delayed} />
								</div>
								<div className="mt-4 space-y-2 text-sm text-slate-400">
									<InfoRow label="Prefix" value={data.queue.prefix} />
									<InfoRow
										label="Connection"
										value={data.queue.connectionUrl || "Not configured"}
									/>
								</div>
							</section>

							<section className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
								<div className="flex items-start justify-between gap-3">
									<div>
										<p className="text-xs uppercase tracking-[0.22em] text-slate-400">
											Thumbnail storage
										</p>
										<h3 className="mt-2 text-xl font-semibold text-white">
											Disk and KV overview
										</h3>
									</div>
									<span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-medium text-slate-300">
										{data.storage.configuredSections} collections
									</span>
								</div>

								<div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
									<MetricCard
										label="Disk thumb files"
										value={data.storage.disk.thumbnailFiles}
									/>
									<MetricCard label="Disk meta files" value={data.storage.disk.metaFiles} />
									<MetricCard
										label="Disk usage"
										value={formatBytes(data.storage.disk.totalBytes)}
									/>
									<MetricCard label="KV thumb blobs" value={data.storage.kv.blobEntries} />
									<MetricCard label="KV meta entries" value={data.storage.kv.metaEntries} />
									<MetricCard
										label="Missing roots"
										value={data.storage.disk.missingRoots}
									/>
								</div>

								<div className="mt-4 space-y-2 text-sm text-slate-400">
									<InfoRow
										label="Disk-backed sections"
										value={String(data.storage.diskBackedSections)}
									/>
									<InfoRow
										label="KV-backed sections"
										value={String(data.storage.kvBackedSections)}
									/>
									<InfoRow
										label="KV connection"
										value={data.storage.kv.connectionUrl || "Not configured"}
									/>
									<InfoRow label="KV prefix" value={data.storage.kv.prefix} />
								</div>
							</section>

							<section className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
								<div className="flex items-center justify-between gap-3">
									<div>
										<p className="text-xs uppercase tracking-[0.22em] text-slate-400">
											Thumbnail roots
										</p>
										<h3 className="mt-2 text-xl font-semibold text-white">
											Disk storage details
										</h3>
									</div>
									<span className="text-xs text-slate-400">
										Updated {formatTimestamp(data.updatedAt)}
									</span>
								</div>
								<div className="mt-4 space-y-3">
									{data.storage.diskRoots.map((root) => (
										<div
											key={root.path}
											className="rounded-2xl border border-white/10 bg-slate-900/50 p-3"
										>
											<div className="flex items-center justify-between gap-3">
												<div className="min-w-0">
													<div className="truncate text-sm font-medium text-white">
														{root.path}
													</div>
													<div className="mt-1 text-xs text-slate-400">
														{root.exists ? "Available" : "Missing"}
													</div>
												</div>
												<span
													className={`rounded-full px-2.5 py-1 text-xs font-medium ${
														root.exists
															? "border border-emerald-400/20 bg-emerald-400/10 text-emerald-100"
															: "border border-amber-400/20 bg-amber-400/10 text-amber-100"
													}`}
												>
													{root.exists ? "Ready" : "Not found"}
												</span>
											</div>
											<div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-300">
												<SmallMetric label="Thumb files" value={root.thumbnailFiles} />
												<SmallMetric label="Meta files" value={root.metaFiles} />
												<SmallMetric label="Folders" value={root.directories} />
												<SmallMetric label="Usage" value={formatBytes(root.totalBytes)} />
											</div>
										</div>
									))}
									{!data.storage.diskRoots.length ? (
										<div className="rounded-2xl border border-dashed border-white/10 bg-slate-900/40 p-4 text-sm text-slate-400">
											No disk-backed thumbnail roots are configured yet.
										</div>
									) : null}
								</div>
							</section>
						</>
					) : null}
				</div>
			</aside>
		</div>
	);
}

function MetricCard({ label, value }: { label: string; value: number | string }) {
	return (
		<div className="rounded-2xl border border-white/10 bg-slate-900/55 p-3">
			<div className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</div>
			<div className="mt-2 text-lg font-semibold text-white">{value}</div>
		</div>
	);
}

function SmallMetric({ label, value }: { label: string; value: number | string }) {
	return (
		<div className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2">
			<div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{label}</div>
			<div className="mt-1 text-sm font-medium text-white">{value}</div>
		</div>
	);
}

function InfoRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex flex-col gap-1 rounded-xl border border-white/8 bg-slate-900/35 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
			<div className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</div>
			<div className="break-all text-sm text-slate-200">{value}</div>
		</div>
	);
}

function formatBytes(bytes: number) {
	if (!bytes) {
		return "0 B";
	}
	const units = ["B", "KB", "MB", "GB", "TB"];
	const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
	const value = bytes / 1024 ** unit;
	return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function formatTimestamp(value: string) {
	const timestamp = new Date(value);
	return Number.isNaN(timestamp.getTime()) ? value : timestamp.toLocaleString();
}
