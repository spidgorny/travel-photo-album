"use client";

import { useEffect } from "react";
import useSWR from "swr";
import { fetcher } from "../../lib/http";
import type { FolderInfoResponse } from "./ui-types";
import { Loading } from "./widget/loading";

interface FolderInfoSidebarProps {
	isOpen: boolean;
	onClose: () => void;
	sectionId: number;
	collectionName?: string;
	folder?: string;
}

export function FolderInfoSidebar({
	isOpen,
	onClose,
	sectionId,
	collectionName,
	folder = "",
}: FolderInfoSidebarProps) {
	const apiUrl =
		sectionId >= 0 ? (folder ? `/api/folder-info/${sectionId}/${folder}` : `/api/folder-info/${sectionId}`) : null;
	const { data, error, isLoading } = useSWR<FolderInfoResponse>(isOpen ? apiUrl : null, fetcher);

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
				aria-label="Close folder information sidebar"
			/>
			<aside
				className={`absolute inset-y-0 right-0 flex w-full max-w-xl flex-col border-l border-white/10 bg-slate-950/95 shadow-2xl shadow-black/50 backdrop-blur-xl transition-transform duration-300 ${
					isOpen ? "translate-x-0" : "translate-x-[calc(100%+2rem)]"
				}`}
			>
				<div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
					<div>
						<p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-200">
							Folder storage
						</p>
						<h2 className="mt-2 text-2xl font-semibold text-white">Current folder details</h2>
						<p className="mt-2 text-sm leading-6 text-slate-400">
							Check how many originals, thumbnails, metadata entries, and stored
							dominant colors exist for the selected folder.
						</p>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-lg text-slate-200 transition hover:border-sky-300/30 hover:text-white"
						aria-label="Close folder information sidebar"
					>
						×
					</button>
				</div>

				<div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
					<section className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
						<p className="text-xs uppercase tracking-[0.22em] text-slate-400">Current view</p>
						<div className="mt-3 space-y-3 text-sm text-slate-200">
							<InfoRow label="Collection" value={collectionName || "No collection selected"} />
							<InfoRow label="Folder" value={folder || "/"} />
						</div>
					</section>

					{isLoading ? (
						<div className="flex min-h-[16rem] items-center justify-center rounded-[1.5rem] border border-dashed border-white/10 bg-slate-900/40">
							<Loading />
						</div>
					) : null}

					{error ? (
						<div className="rounded-[1.5rem] border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-100">
							Failed to load folder info.
						</div>
					) : null}

					{data ? (
						<>
							<section className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
								<div className="flex items-start justify-between gap-3">
									<div>
										<p className="text-xs uppercase tracking-[0.22em] text-slate-400">
											Storage mode
										</p>
										<h3 className="mt-2 text-xl font-semibold text-white">
											{data.storageMode === "kv" ? "KV-backed folder" : "Disk-backed folder"}
										</h3>
									</div>
									<span className="rounded-full border border-sky-300/20 bg-sky-300/10 px-2.5 py-1 text-xs font-medium text-sky-100">
										Updated {formatTimestamp(data.updatedAt)}
									</span>
								</div>
								<div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
									<MetricCard label="Original files" value={data.counts.originalFiles} />
									<MetricCard label="Images" value={data.counts.imageFiles} />
									<MetricCard label="Videos" value={data.counts.videoFiles} />
									<MetricCard label="Thumbnails" value={data.counts.thumbnails} />
									<MetricCard label="Metadata" value={data.counts.metadataEntries} />
									<MetricCard label="EXIF entries" value={data.counts.exifEntries} />
								</div>
							</section>

							<section className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
								<p className="text-xs uppercase tracking-[0.22em] text-slate-400">KV details</p>
								<div className="mt-4 grid grid-cols-2 gap-3">
									<MetricCard label="KV thumb entries" value={data.counts.kvThumbEntries} />
									<MetricCard label="KV meta entries" value={data.counts.kvMetaEntries} />
									<MetricCard
										label="Dominant colors"
										value={data.counts.dominantColors}
									/>
									<MetricCard label="Unsupported files" value={data.counts.unsupportedFiles} />
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

function InfoRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex flex-col gap-1 rounded-xl border border-white/8 bg-slate-900/35 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
			<div className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</div>
			<div className="break-all text-sm text-slate-200">{value}</div>
		</div>
	);
}

function formatTimestamp(value: string) {
	const timestamp = new Date(value);
	return Number.isNaN(timestamp.getTime()) ? value : timestamp.toLocaleString();
}
