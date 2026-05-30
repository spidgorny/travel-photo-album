import type { CSSProperties, ComponentType, MouseEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import Gallery from "react-photo-gallery";
import { fetcher } from "../lib/http";
import { Loading } from "./widget/loading";
import type { FilesResponse, GalleryPhoto } from "./ui-types";

interface GalleryOneDayProps {
	sectionId: number;
	folder: string;
	date: string;
}

interface LightboxArgs {
	photo: GalleryPhoto;
	index: number;
}

interface ImageRendererProps {
	index: number;
	left: number;
	top: number;
	key?: string;
	photo: GalleryPhoto;
}

type PhotoGalleryComponentProps = {
	photos: GalleryPhoto[];
	direction?: "row" | "column";
	margin?: number;
	targetRowHeight?: number;
	onClick: (_event: MouseEvent<HTMLElement>, args: LightboxArgs) => void;
	renderImage: (props: ImageRendererProps) => ReactNode;
};

const PhotoGallery = Gallery as unknown as ComponentType<PhotoGalleryComponentProps>;

export function GalleryOneDay({ sectionId, folder, date }: GalleryOneDayProps) {
	const apiUrl = `/api/filesByDate/${sectionId}/${folder}/${date}`;
	const { data } = useSWR<FilesResponse>(apiUrl, fetcher);

	const [currentImage, setCurrentImage] = useState(0);
	const [viewerIsOpen, setViewerIsOpen] = useState(false);

	const openLightbox = useCallback(
		(_event: MouseEvent<HTMLElement>, { index }: LightboxArgs) => {
			setCurrentImage(index);
			setViewerIsOpen(true);
		},
		[],
	);

	const closeLightbox = useCallback(() => {
		setCurrentImage(0);
		setViewerIsOpen(false);
	}, []);

	const photos = useMemo<GalleryPhoto[]>(() => {
		const files = Array.isArray(data?.files) ? data.files : [];

		return files.map((file) => {
			const filePath = typeof file.path === "string" ? file.path : "";
			const src = `/api/photo/${sectionId}/${folder}/${filePath}`;
			const thumbSrc = `/api/thumb/${sectionId}/${folder}/${filePath}`;
			const photoKey = `${sectionId}:${folder}:${filePath}`;
			const fileName = filePath.split("/").at(-1) ?? filePath;

			return {
				...file,
				key: photoKey,
				src,
				source: {
					regular: src,
					thumbnail: thumbSrc,
				},
				width:
					typeof file.width === "number" && file.width > 0 ? file.width : 3,
				height:
					typeof file.height === "number" && file.height > 0 ? file.height : 2,
				caption: fileName,
				original:
					typeof file.width === "number" && typeof file.height === "number"
						? { width: file.width, height: file.height }
						: undefined,
			};
		});
	}, [data, folder, sectionId]);

	const [dimensions, setDimensions] = useState<GalleryPhoto[]>(photos);

	const showPreviousImage = useCallback(() => {
		setCurrentImage((index) => (index > 0 ? index - 1 : index));
	}, []);

	const showNextImage = useCallback(() => {
		setCurrentImage((index) => (index < dimensions.length - 1 ? index + 1 : index));
	}, [dimensions.length]);

	useEffect(() => {
		setDimensions(photos);
	}, [photos]);

	useEffect(() => {
		if (!viewerIsOpen) {
			return;
		}

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				closeLightbox();
				return;
			}

			if (event.key === "ArrowLeft") {
				showPreviousImage();
				return;
			}

			if (event.key === "ArrowRight") {
				showNextImage();
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => {
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [closeLightbox, showNextImage, showPreviousImage, viewerIsOpen]);

	const currentPhoto = dimensions[currentImage] ?? null;

	const imageRenderer = (props: ImageRendererProps) => {
		const { index, left, top, key, photo } = props;

		return (
			<SelectedImage
				key={key ?? photo.key}
				margin="2px"
				index={index}
				photo={photo}
				left={left}
				top={top}
				onClick={openLightbox}
			/>
		);
	};

	return (
		<div className="space-y-4">
			{!data && (
				<div className="flex min-h-[12rem] items-center justify-center rounded-3xl border border-dashed border-white/10 bg-slate-950/40">
					<Loading />
				</div>
			)}
			{data && !dimensions.length && (
				<div className="rounded-3xl border border-dashed border-white/10 bg-slate-950/40 px-4 py-8 text-center text-sm text-slate-400">
					No photos matched this day.
				</div>
			)}
			{!!dimensions.length && (
				<PhotoGallery
					photos={dimensions}
					direction="row"
					margin={2}
					targetRowHeight={300}
					onClick={openLightbox}
					renderImage={imageRenderer}
				/>
			)}
			{viewerIsOpen && currentPhoto ? (
				<div
					className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-4 backdrop-blur-sm"
					onClick={closeLightbox}
					role="presentation"
				>
					<div
						className="relative flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950 shadow-2xl shadow-black/50"
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
									{currentImage + 1} / {dimensions.length}
								</div>
							</div>
							<button
								type="button"
								onClick={closeLightbox}
								className="rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-200 transition hover:border-white/20 hover:bg-white/[0.05] hover:text-white"
							>
								Close
							</button>
						</div>
						<div className="relative flex min-h-[60vh] items-center justify-center bg-slate-950/80 p-4 sm:p-6">
							{currentImage > 0 ? (
								<button
									type="button"
									onClick={showPreviousImage}
									className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-white transition hover:border-sky-300/40 hover:bg-slate-900"
									aria-label="Previous image"
								>
									Prev
								</button>
							) : null}
							<img
								src={currentPhoto.source.regular}
								alt={currentPhoto.title ?? currentPhoto.caption}
								className="max-h-[78vh] w-auto max-w-full rounded-2xl object-contain"
							/>
							{currentImage < dimensions.length - 1 ? (
								<button
									type="button"
									onClick={showNextImage}
									className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-white transition hover:border-sky-300/40 hover:bg-slate-900"
									aria-label="Next image"
								>
									Next
								</button>
							) : null}
						</div>
					</div>
				</div>
			) : null}
		</div>
	);
}

interface SelectedImageProps {
	index: number;
	photo: GalleryPhoto;
	margin: string | number;
	left: number;
	top: number;
	selected?: boolean;
	onClick: (_event: MouseEvent<HTMLElement>, args: LightboxArgs) => void;
}

function SelectedImage({ index, photo, margin, selected, onClick }: SelectedImageProps) {
	const fileName = photo.path.split("/").at(-1) ?? photo.caption ?? "Photo";
	const dimensionLabel =
		photo.original?.width && photo.original?.height
			? `${photo.original.width.toFixed(0)} x ${photo.original.height.toFixed(0)}`
			: null;
	const containerStyle: CSSProperties = {
		cursor: "pointer",
		margin,
		overflow: "hidden",
		position: "relative",
		width: photo.width,
	};

	return (
		<div
			style={containerStyle}
			className={[
				"group overflow-hidden rounded-3xl border border-white/10 bg-slate-950/80 shadow-lg shadow-black/20 transition duration-200 hover:-translate-y-0.5 hover:border-sky-300/40",
				selected ? "ring-2 ring-sky-300/60" : "",
			].join(" ")}
		>
			<img
				src={photo.source.thumbnail}
				title={photo.title ?? photo.caption}
				alt={photo.title ?? photo.caption}
				onClick={(event) => onClick(event, { photo, index })}
				width={photo.width}
				height={photo.height}
				loading="lazy"
				className="block h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
			/>
			<div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent px-3 pb-3 pt-10">
				<div className="truncate text-sm font-medium text-white">{fileName}</div>
				<div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-300/80">
					{dimensionLabel ?? "Photo"}
				</div>
			</div>
		</div>
	);
}
