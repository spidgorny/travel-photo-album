"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type WheelEvent } from "react";
import Image from "next/image";
import { PhashBitmap } from "./phash-bitmap";
import type { GalleryPhoto, MetaResponse } from "./ui-types";
import { ErrorState } from "./widget/loading";

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
					<FullscreenMedia key={currentPhoto.key} photo={currentPhoto} />
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
	meta?: MetaResponse | null;
	photo?: GalleryPhoto | null;
	isLoading?: boolean;
	errorMessage?: string;
	error?: unknown;
	onRetry?: () => void | Promise<unknown>;
}

interface MetadataRow {
	key: string;
	value: ReactNode;
}

export function MetadataSidebar({
	metadata,
	meta,
	photo,
	isLoading = false,
	errorMessage,
	error,
	onRetry,
}: MetadataSidebarProps) {
	const rows = useMemo(() => buildMetadataRows({ metadata, meta, photo }), [metadata, meta, photo]);

	if (errorMessage) {
		return (
			<ErrorState
				message="Failed to load stored metadata."
				error={error}
				details={errorMessage}
				onRetry={onRetry}
			/>
		);
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

function buildMetadataRows({
	metadata,
	meta,
	photo,
}: {
	metadata?: Record<string, unknown> | null;
	meta?: MetaResponse | null;
	photo?: GalleryPhoto | null;
}) {
	const rows: MetadataRow[] = [];
	const hiddenKeys = new Set<string>();
	const description =
		typeof meta?.description === "string" && meta.description.trim()
			? meta.description.trim()
			: typeof metadata?.description === "string" && metadata.description.trim()
				? metadata.description.trim()
				: typeof photo?.description === "string" && photo.description.trim()
					? photo.description.trim()
					: undefined;
	const dominantColor =
		typeof photo?.dominantColor === "string" && photo.dominantColor
			? photo.dominantColor
			: typeof meta?.dominantColor === "string" && meta.dominantColor
				? meta.dominantColor
				: typeof metadata?.dominantColor === "string" && metadata.dominantColor
					? metadata.dominantColor
					: undefined;
	const location =
		meta?.location && typeof meta.location === "object"
			? meta.location
			: metadata?.location && typeof metadata.location === "object"
				? (metadata.location as MetaResponse["location"])
				: undefined;
	const city = location?.locality ?? undefined;
	const locationLabel = formatLocation(location);
	const gps = meta?.GPS ?? (metadata?.GPS as MetaResponse["GPS"] | undefined);
	const gpsLabel = formatGps(gps);
	const phash =
		typeof meta?.phash === "string" && meta.phash
			? meta.phash
			: typeof photo?.phash === "string" && photo.phash
				? photo.phash
				: typeof metadata?.phash === "string" && metadata.phash
					? metadata.phash
					: undefined;
	const width =
		meta?.COMPUTED?.Width ??
		meta?.COMPUTED?.width ??
		meta?.dimensions?.width ??
		photo?.original?.width ??
		(undefined as number | undefined);
	const height =
		meta?.COMPUTED?.Height ??
		meta?.COMPUTED?.height ??
		meta?.dimensions?.height ??
		photo?.original?.height ??
		(undefined as number | undefined);

	pushMetadataRow(rows, hiddenKeys, "Description", description, ["description"]);
	if (dominantColor) {
		rows.push({
			key: "Dominant color",
			value: (
				<span className="inline-flex items-center gap-2">
					<span
						className="inline-block h-4 w-4 rounded-full border border-white/15"
						style={{ backgroundColor: dominantColor }}
					/>
					<span>{dominantColor}</span>
				</span>
			),
		});
		hiddenKeys.add("dominantColor");
	}
	pushMetadataRow(rows, hiddenKeys, "City", city, ["location.locality"]);
	pushMetadataRow(rows, hiddenKeys, "Location", locationLabel, [
		"location.label",
		"location.countryIso2",
		"location.countryName",
	]);
	pushMetadataRow(rows, hiddenKeys, "GPS", gpsLabel, ["GPS.latitude", "GPS.longitude"]);
	pushMetadataRow(rows, hiddenKeys, "pHash", phash, ["phash"]);
	if (typeof width === "number" || typeof height === "number") {
		rows.push({
			key: "Dimensions",
			value: `${typeof width === "number" ? width : "?"} x ${typeof height === "number" ? height : "?"}`,
		});
		hiddenKeys.add("COMPUTED.Width");
		hiddenKeys.add("COMPUTED.Height");
		hiddenKeys.add("COMPUTED.width");
		hiddenKeys.add("COMPUTED.height");
		hiddenKeys.add("dimensions.width");
		hiddenKeys.add("dimensions.height");
	}

	const remainingRows = flattenMetadata(buildMetadataDetails(metadata, meta, photo)).filter(
		(row) => !hiddenKeys.has(row.key),
	);
	return [...rows, ...remainingRows];
}

function buildMetadataDetails(
	metadata: Record<string, unknown> | null | undefined,
	meta: MetaResponse | null | undefined,
	photo: GalleryPhoto | null | undefined,
) {
	return {
		photo: photo
			? {
					caption: photo.caption,
					title: photo.title,
					dominantColor: photo.dominantColor,
					description: photo.description,
					phash: photo.phash,
					original: photo.original,
				}
			: undefined,
		meta: meta
			? {
					...meta,
					storedMeta: undefined,
					metaSearchKeys: undefined,
				}
			: undefined,
		storedMeta: metadata ?? undefined,
	};
}

function pushMetadataRow(
	rows: MetadataRow[],
	hiddenKeys: Set<string>,
	label: string,
	value: string | undefined,
	coveredKeys: string[],
) {
	if (!value) {
		return;
	}
	rows.push({ key: label, value });
	coveredKeys.forEach((key) => hiddenKeys.add(key));
}

function formatLocation(location: MetaResponse["location"]) {
	if (!location) {
		return undefined;
	}

	const parts = [location.label, location.countryName ?? location.countryIso2]
		.filter((value, index, array) => typeof value === "string" && value.length > 0 && array.indexOf(value) === index);
	return parts.length ? parts.join(" - ") : undefined;
}

function formatGps(gps: MetaResponse["GPS"]) {
	if (!gps) {
		return undefined;
	}
	const latitude =
		typeof gps.latitude === "number" && Number.isFinite(gps.latitude) ? gps.latitude : null;
	const longitude =
		typeof gps.longitude === "number" && Number.isFinite(gps.longitude) ? gps.longitude : null;
	if (latitude === null || longitude === null) {
		return undefined;
	}
	return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
}

function FullscreenMedia({ photo }: { photo: GalleryPhoto }) {
	if (isVideoPhoto(photo)) {
		return <FullscreenVideo photo={photo} />;
	}

	return <FullscreenImage photo={photo} />;
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

	const fallbackSrc = photo.source.thumbnail ?? photo.source.fullscreen;

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
			<Image
				src={fallbackSrc}
				alt={photo.title ?? photo.caption ?? ''}
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
				fill
				sizes="100vw"
				unoptimized
			/>
			{shouldLoadOriginal ? (
				<Image
					src={photo.source.regular}
					alt={photo.title ?? photo.caption ?? ''}
					onLoad={() => setOriginalStatus("loaded")}
					onError={() => setOriginalStatus("error")}
					className={[
						"absolute inset-0 h-full w-full object-contain transition duration-300",
						originalStatus === "loaded" ? "opacity-100" : "opacity-0",
					].join(" ")}
					fill
					sizes="100vw"
					unoptimized
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

function FullscreenVideo({ photo }: { photo: GalleryPhoto }) {
	const [videoStatus, setVideoStatus] = useState<"loading" | "ready" | "error">("loading");

	useEffect(() => {
		setVideoStatus("loading");
	}, [photo.key, photo.source.regular]);

	return (
		<div
			className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-2xl"
			style={{ backgroundColor: photo.dominantColor ?? "#020617" }}
		>
			<PhashBitmap value={photo.phash} className="absolute right-3 top-3 z-10" />
			{videoStatus !== "ready" ? (
				<div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-1 bg-slate-800/80">
					<div
						className={[
							"h-full transition-all duration-300",
							videoStatus === "error"
								? "w-full bg-red-500"
								: "w-1/3 animate-pulse rounded-r-full bg-sky-400/90",
						].join(" ")}
					/>
				</div>
			) : null}
			<video
				src={photo.source.regular}
				poster={photo.source.thumbnail ?? photo.source.fullscreen}
				controls
				autoPlay
				playsInline
				preload="metadata"
				onLoadedData={() => setVideoStatus("ready")}
				onError={() => setVideoStatus("error")}
				className="relative z-[1] h-full w-full object-contain"
			>
				Your browser does not support the video tag.
			</video>
			{videoStatus === "error" ? (
				<div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 mx-auto w-fit rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-sm text-red-100">
					Failed to load video.
				</div>
			) : null}
		</div>
	);
}

function isVideoPhoto(photo: GalleryPhoto) {
	const filePath = typeof photo.path === "string" ? photo.path : "";
	return /\.(mp4|mov|m4v|avi|mkv|webm|wmv|mpg|mpeg|3gp)$/i.test(filePath);
}
