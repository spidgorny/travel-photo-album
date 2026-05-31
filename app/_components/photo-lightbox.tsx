"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState, type ReactNode, type WheelEvent } from "react";
import { PhashBitmap } from "./phash-bitmap";
import type { GalleryPhoto } from "./ui-types";

interface LightboxSidebarProps {
	buttonLabel: string;
	title: string;
	content: ReactNode;
}

interface PhotoLightboxProps {
	photos: GalleryPhoto[];
	currentIndex: number;
	isOpen: boolean;
	onClose: () => void;
	onPrevious: () => void;
	onNext: () => void;
	footer?: ReactNode;
	sidebar?: LightboxSidebarProps | null;
}

export function PhotoLightbox({
	photos,
	currentIndex,
	isOpen,
	onClose,
	onPrevious,
	onNext,
	footer,
	sidebar,
}: PhotoLightboxProps) {
	const currentPhoto = photos[currentIndex] ?? null;
	const lastWheelNavigationAt = useRef(0);
	const [isSidebarOpen, setIsSidebarOpen] = useState(false);

	useEffect(() => {
		if (!isOpen) {
			setIsSidebarOpen(false);
		}
	}, [isOpen]);

	const handleViewerWheel = useCallback(
		(event: WheelEvent<HTMLDivElement>) => {
			if (Math.abs(event.deltaY) < 12) {
				return;
			}

			const now = Date.now();
			if (now - lastWheelNavigationAt.current < 250) {
				return;
			}

			lastWheelNavigationAt.current = now;
			event.preventDefault();

			if (event.deltaY > 0) {
				onNext();
				return;
			}

			onPrevious();
		},
		[onNext, onPrevious],
	);

	useEffect(() => {
		if (!isOpen) {
			return;
		}

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				onClose();
				return;
			}

			if (event.key === "ArrowLeft") {
				onPrevious();
				return;
			}

			if (event.key === "ArrowRight") {
				onNext();
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => {
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [isOpen, onClose, onNext, onPrevious]);

	if (!isOpen || !currentPhoto || typeof document === "undefined") {
		return null;
	}

	return createPortal(
		<div
			className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/90 p-1 backdrop-blur-sm"
			onClick={onClose}
			role="presentation"
		>
			<div
				className="relative flex h-[98vh] w-[98%] max-w-none flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950 shadow-2xl shadow-black/50"
				onClick={(event) => event.stopPropagation()}
				role="dialog"
				aria-modal="true"
				aria-label={currentPhoto.caption ?? "Photo viewer"}
			>
				<div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-5">
					<div className="min-w-0">
						<div className="truncate text-sm font-medium text-white">
							{currentPhoto.caption ?? "Photo"}
						</div>
						<div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">
							{currentIndex + 1} / {photos.length}
						</div>
					</div>
					<div className="flex items-center gap-2">
						{sidebar ? (
							<button
								type="button"
								onClick={() => setIsSidebarOpen((open) => !open)}
								className="rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-200 transition hover:border-sky-300/40 hover:bg-sky-300/10 hover:text-white"
							>
								{isSidebarOpen ? `Hide ${sidebar.buttonLabel}` : sidebar.buttonLabel}
							</button>
						) : null}
						<button
							type="button"
							onClick={onClose}
							className="rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-200 transition hover:border-white/20 hover:bg-white/[0.05] hover:text-white"
						>
							Close
						</button>
					</div>
				</div>
				<div
					className="relative flex min-h-0 flex-1 items-center justify-center bg-slate-950/80 p-2 sm:p-3"
					onWheel={handleViewerWheel}
				>
					{currentIndex > 0 ? (
						<button
							type="button"
							onClick={onPrevious}
							className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-white transition hover:border-sky-300/40 hover:bg-slate-900"
							aria-label="Previous image"
						>
							Prev
						</button>
					) : null}
					<FullscreenImage key={currentPhoto.key} photo={currentPhoto} />
					{currentIndex < photos.length - 1 ? (
						<button
							type="button"
							onClick={onNext}
							className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-white transition hover:border-sky-300/40 hover:bg-slate-900"
							aria-label="Next image"
						>
							Next
						</button>
					) : null}
					{sidebar && isSidebarOpen ? (
						<aside className="absolute inset-y-0 right-0 z-20 flex w-full max-w-md flex-col border-l border-white/10 bg-slate-950/95 shadow-2xl shadow-black/40">
							<div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
								<div className="text-sm font-medium text-white">{sidebar.title}</div>
								<button
									type="button"
									onClick={() => setIsSidebarOpen(false)}
									className="rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-slate-300 transition hover:border-white/20 hover:bg-white/[0.05] hover:text-white"
								>
									Close
								</button>
							</div>
							<div className="min-h-0 flex-1 overflow-y-auto p-4">{sidebar.content}</div>
						</aside>
					) : null}
				</div>
				{footer ? <div className="border-t border-white/10 px-4 py-3 sm:px-5">{footer}</div> : null}
			</div>
		</div>,
		document.body,
	);
}

interface MetadataSidebarProps {
	metadata?: Record<string, unknown> | null;
	isLoading?: boolean;
	errorMessage?: string;
}

interface MetadataRow {
	key: string;
	value: string;
}

export function MetadataSidebar({
	metadata,
	isLoading = false,
	errorMessage,
}: MetadataSidebarProps) {
	const rows = flattenMetadata(metadata);

	if (errorMessage) {
		return <div className="text-sm text-red-300">{errorMessage}</div>;
	}

	if (isLoading) {
		return <div className="text-sm text-slate-300">Loading metadata...</div>;
	}

	if (!rows.length) {
		return (
			<div className="text-sm text-slate-400">
				No stored metadata is available for this image yet.
			</div>
		);
	}

	return (
		<div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/60">
			<table className="min-w-full border-collapse text-left text-sm">
				<thead className="bg-white/[0.04] text-xs uppercase tracking-[0.18em] text-slate-400">
					<tr>
						<th className="w-[42%] px-3 py-2 font-medium">Field</th>
						<th className="px-3 py-2 font-medium">Value</th>
					</tr>
				</thead>
				<tbody>
					{rows.map((row) => (
						<tr key={row.key} className="border-t border-white/10 align-top">
							<th className="px-3 py-2 font-medium text-slate-300">{row.key}</th>
							<td className="px-3 py-2 whitespace-pre-wrap break-all text-slate-100">
								{row.value}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

function flattenMetadata(metadata: Record<string, unknown> | null | undefined) {
	if (!metadata || typeof metadata !== "object") {
		return [] as MetadataRow[];
	}

	const rows: MetadataRow[] = [];
	appendMetadataRows(rows, metadata);
	return rows;
}

function appendMetadataRows(
	rows: MetadataRow[],
	value: Record<string, unknown> | unknown[],
	path = "",
) {
	if (Array.isArray(value)) {
		if (!value.length && path) {
			rows.push({ key: path, value: "[]" });
			return;
		}
		value.forEach((entry, index) => {
			appendUnknownValue(rows, entry, `${path}[${index}]`);
		});
		return;
	}

	const entries = Object.entries(value);
	if (!entries.length && path) {
		rows.push({ key: path, value: "{}" });
		return;
	}

	entries.forEach(([entryKey, entryValue]) => {
		const nextPath = path ? `${path}.${entryKey}` : entryKey;
		appendUnknownValue(rows, entryValue, nextPath);
	});
}

function appendUnknownValue(rows: MetadataRow[], value: unknown, path: string) {
	if (Array.isArray(value)) {
		appendMetadataRows(rows, value, path);
		return;
	}

	if (value && typeof value === "object") {
		appendMetadataRows(rows, value as Record<string, unknown>, path);
		return;
	}

	rows.push({ key: path, value: formatMetadataValue(value) });
}

function formatMetadataValue(value: unknown) {
	if (value === null) {
		return "null";
	}

	if (value === undefined) {
		return "undefined";
	}

	if (typeof value === "string") {
		return value;
	}

	if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
		return String(value);
	}

	return JSON.stringify(value);
}

function FullscreenImage({ photo }: { photo: GalleryPhoto }) {
	const [previewLoaded, setPreviewLoaded] = useState(false);
	const [shouldLoadOriginal, setShouldLoadOriginal] = useState(false);
	const [originalStatus, setOriginalStatus] = useState<"loading" | "loaded" | "error">(
		"loading",
	);

	useEffect(() => {
		setPreviewLoaded(false);
		setShouldLoadOriginal(false);
		setOriginalStatus("loading");
	}, [photo.key, photo.source.regular]);

	const fallbackSrc = photo.source.fullscreen ?? photo.source.thumbnail;

	return (
		<div
			className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-2xl"
			style={{ backgroundColor: photo.dominantColor ?? "#020617" }}
		>
			<PhashBitmap value={photo.phash} className="absolute right-3 top-3 z-10" />
			{originalStatus !== "loaded" ? (
				<div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-1 bg-slate-800/80">
					<div
						className={[
							"h-full transition-all duration-300",
							originalStatus === "error"
								? "w-full bg-red-500"
								: "w-1/3 animate-pulse rounded-r-full bg-sky-400/90",
						].join(" ")}
					/>
				</div>
			) : null}
			<img
				src={fallbackSrc}
				alt={photo.title ?? photo.caption}
				onLoad={() => {
					setPreviewLoaded(true);
					setShouldLoadOriginal(true);
				}}
				onError={() => {
					setPreviewLoaded(false);
					setShouldLoadOriginal(true);
				}}
				className={[
					"h-full w-full object-contain transition duration-300",
					originalStatus === "loaded" ? "opacity-0" : "opacity-100",
				].join(" ")}
			/>
			{shouldLoadOriginal ? (
				<img
					src={photo.source.regular}
					alt={photo.title ?? photo.caption}
					onLoad={() => setOriginalStatus("loaded")}
					onError={() => setOriginalStatus("error")}
					className={[
						"absolute inset-0 h-full w-full object-contain transition duration-300",
						originalStatus === "loaded" ? "opacity-100" : "opacity-0",
					].join(" ")}
				/>
			) : null}
			{!previewLoaded && !shouldLoadOriginal ? (
				<div
					className="pointer-events-none absolute inset-0 animate-pulse"
					style={{ backgroundColor: photo.dominantColor ?? "#020617", opacity: 0.9 }}
				/>
			) : null}
		</div>
	);
}
