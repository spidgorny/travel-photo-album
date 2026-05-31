"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState, type ReactNode, type WheelEvent } from "react";
import type { GalleryPhoto } from "./ui-types";

interface PhotoLightboxProps {
	photos: GalleryPhoto[];
	currentIndex: number;
	isOpen: boolean;
	onClose: () => void;
	onPrevious: () => void;
	onNext: () => void;
	footer?: ReactNode;
}

export function PhotoLightbox({
	photos,
	currentIndex,
	isOpen,
	onClose,
	onPrevious,
	onNext,
	footer,
}: PhotoLightboxProps) {
	const currentPhoto = photos[currentIndex] ?? null;
	const lastWheelNavigationAt = useRef(0);

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
				<div className="flex items-center justify-between border-b border-white/10 px-4 py-3 sm:px-5">
					<div className="min-w-0">
						<div className="truncate text-sm font-medium text-white">
							{currentPhoto.caption ?? "Photo"}
						</div>
						<div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">
							{currentIndex + 1} / {photos.length}
						</div>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-200 transition hover:border-white/20 hover:bg-white/[0.05] hover:text-white"
					>
						Close
					</button>
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
				</div>
				{footer ? <div className="border-t border-white/10 px-4 py-3 sm:px-5">{footer}</div> : null}
			</div>
		</div>,
		document.body,
	);
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
