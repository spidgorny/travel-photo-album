"use client";

import { useEffect } from "react";
import useSWR from "swr";
import { fetcher } from "../../lib/api/http";
import type { ThumbStorageResponse } from "./ui-types";
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
	const {
		data: storageData,
		error: storageError,
		isLoading: isStorageLoading,
		mutate: mutateStorage,
	} = useSWR<ThumbStorageResponse>(
		isOpen ? "/api/storage-info" : null,
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
							KVrocks storage
						</h2>
						<p className="mt-2 text-sm leading-6 text-slate-400">
							Check thumbnail and metadata coverage in KVrocks without leaving the gallery.
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

					{storageError ? (
						<ErrorState
							message="Failed to load thumbnail storage info."
							error={storageError}
							details={getErrorMessage(storageError)}
							onRetry={() => mutateStorage()}
						/>
					) : null}

					{storageData ? (
						<>
							<section className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
								<div className="flex items-start justify-between gap-3">
									<div>
										<p className="text-xs uppercase tracking-[0.22em] text-slate-400">
											KVrocks
										</p>
										<h3 className="mt-2 text-xl font-semibold text-white">
											Thumbnail and metadata overview
										</h3>
									</div>
									<span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-medium text-slate-300">
										{storageData.storage.configuredSections} collections
									</span>
								</div>

								<div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
									<MetricCard
										label="Thumb blobs"
										value={storageData.storage.kv.blobEntries}
									/>
									<MetricCard
										label="Thumb meta hashes"
										value={storageData.storage.kv.thumbnailMetaEntries}
									/>
									<MetricCard
										label="Directory meta keys"
										value={storageData.storage.kv.directoryMetaKeys}
									/>
									<MetricCard
										label="Indexed files"
										value={storageData.storage.kv.fileMetadataEntries}
									/>
									<MetricCard
										label="Descriptions"
										value={storageData.storage.kv.descriptionEntries}
									/>
									<MetricCard label="GPS entries" value={storageData.storage.kv.gpsEntries} />
								</div>

								<div className="mt-4 space-y-2 text-sm text-slate-400">
									<InfoRow label="Total keys" value={formatNullableNumber(storageData.storage.kv.totalKeys)} />
									<InfoRow
										label="Used memory"
										value={
											storageData.storage.kv.usedMemoryHuman ||
											formatNullableBytes(storageData.storage.kv.usedMemoryBytes)
										}
									/>
									<InfoRow
										label="KV connection"
										value={storageData.storage.kv.connectionUrl || "Not configured"}
									/>
									<InfoRow label="KV prefix" value={storageData.storage.kv.prefix} />
								</div>
							</section>

							<section className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
								<div className="flex items-center justify-between gap-3">
									<div>
										<p className="text-xs uppercase tracking-[0.22em] text-slate-400">
											Metadata coverage
										</p>
										<h3 className="mt-2 text-xl font-semibold text-white">
											What is stored in KVrocks
										</h3>
									</div>
									<span className="text-xs text-slate-400">
										Updated {formatTimestamp(storageData.updatedAt)}
									</span>
								</div>
								<div className="mt-4 space-y-3">
									<div className="grid grid-cols-2 gap-3">
										<SmallMetric
											label="Files with location"
											value={storageData.storage.kv.locationEntries}
										/>
										<SmallMetric
											label="Files with pHash"
											value={storageData.storage.kv.phashEntries}
										/>
										<SmallMetric
											label="Files with GPS"
											value={storageData.storage.kv.gpsEntries}
										/>
										<SmallMetric
											label="Files with descriptions"
											value={storageData.storage.kv.descriptionEntries}
										/>
									</div>
									<div className="rounded-2xl border border-white/10 bg-slate-900/50 p-4 text-sm text-slate-300">
										Directory metadata is scanned from <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs text-slate-200">{storageData.storage.kv.prefix}:directory-meta:*</code>, so these counts reflect stored per-file metadata in KVrocks rather than old disk caches.
									</div>
								</div>
							</section>
						</>
					) : null}

					{isStorageLoading && !storageError && !storageData ? (
						<PanelLoading label="Loading thumbnail storage info..." />
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

function PanelLoading({ label }: { label: string }) {
	return (
		<section className="flex min-h-[12rem] items-center justify-center rounded-[1.5rem] border border-dashed border-white/10 bg-slate-900/40">
			<div className="flex flex-col items-center gap-3 text-sm text-slate-400">
				<Loading />
				<div>{label}</div>
			</div>
		</section>
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

function formatNullableBytes(bytes: number | null) {
	return typeof bytes === "number" ? formatBytes(bytes) : "Unavailable";
}

function formatNullableNumber(value: number | null) {
	return typeof value === "number" ? value.toLocaleString() : "Unavailable";
}

function formatTimestamp(value: string) {
	const timestamp = new Date(value);
	return Number.isNaN(timestamp.getTime()) ? value : timestamp.toLocaleString();
}
