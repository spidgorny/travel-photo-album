"use client";

import type { CSSProperties, ComponentType, MouseEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import Gallery from "react-photo-gallery";
import useSWR from "swr";
import { fetcher } from "../../lib/http";
import { PhashBitmap } from "./phash-bitmap";
import { MetadataSidebar, PhotoLightbox } from "./photo-lightbox";
import type { FilesResponse, GalleryPhoto, MetaResponse } from "./ui-types";
import { buildApiPath } from "./url-paths";
import { ErrorState, Loading, getErrorMessage } from "./widget/loading";

interface GalleryOneDayProps {
	sectionId: number;
	folder: string;
	date: string;
}

const FULLSCREEN_THUMB_VARIANT = "w1600-jpeg";

interface LightboxArgs {
	photo: GalleryPhoto;
	index: number;
}

interface GroupedGalleryPhoto extends GalleryPhoto {
	lightboxIndex: number;
	groupedPhotoCount: number;
	groupMemberIndices: number[];
}

interface ImageRendererProps {
	index: number;
	left: number;
	top: number;
	key?: string;
	photo: GroupedGalleryPhoto;
}

type PhotoGalleryComponentProps = {
	photos: GroupedGalleryPhoto[];
	direction?: "row" | "column";
	margin?: number;
	columns?: number | ((containerWidth: number) => number);
	targetRowHeight?: number;
	onClick: (_event: MouseEvent<HTMLElement>, args: LightboxArgs) => void;
	renderImage: (props: ImageRendererProps) => ReactNode;
};

const PhotoGallery = Gallery as unknown as ComponentType<PhotoGalleryComponentProps>;
const MAX_SIMILAR_LOOKBACK = 3;
const MAX_PHASH_DISTANCE = 28;

export function GalleryOneDay({ sectionId, folder, date }: GalleryOneDayProps) {
	const apiUrl = buildApiPath("/api/filesByDate", sectionId, folder, date);
	const { data, error, mutate } = useSWR<FilesResponse>(apiUrl, fetcher);

	const [currentImage, setCurrentImage] = useState(0);
	const [viewerIsOpen, setViewerIsOpen] = useState(false);
	const [lightboxPhotoKeys, setLightboxPhotoKeys] = useState<string[]>([]);

	const closeLightbox = useCallback(() => {
		setCurrentImage(0);
		setLightboxPhotoKeys([]);
		setViewerIsOpen(false);
	}, []);

	const photos = useMemo<GalleryPhoto[]>(() => {
		const files = Array.isArray(data?.files) ? data.files : [];

		return files.map((file) => {
			const filePath = typeof file.path === "string" ? file.path : "";
			const src = buildApiPath("/api/photo", sectionId, folder, filePath);
			const thumbSrc = buildApiPath("/api/thumb", sectionId, folder, filePath);
			const photoKey = `${sectionId}:${folder}:${filePath}`;
			const fileName = filePath.split("/").at(-1) ?? filePath;

			return {
				...file,
				key: photoKey,
				src,
				source: {
					regular: src,
					fullscreen: `${thumbSrc}?variant=${FULLSCREEN_THUMB_VARIANT}`,
					thumbnail: thumbSrc,
				},
				width: typeof file.width === "number" && file.width > 0 ? file.width : 3,
				height: typeof file.height === "number" && file.height > 0 ? file.height : 2,
				caption: fileName,
				description: typeof file.description === "string" ? file.description : undefined,
				phash: typeof file.phash === "string" ? file.phash : undefined,
				dominantColor:
					typeof file.dominantColor === "string" && file.dominantColor
						? file.dominantColor
						: "#0f172a",
				original:
					typeof file.width === "number" && typeof file.height === "number"
						? { width: file.width, height: file.height }
						: undefined,
			};
		});
	}, [data, folder, sectionId]);

	const [dimensions, setDimensions] = useState<GalleryPhoto[]>(photos);
	const groupedPhotos = useMemo(
		() => groupSequentialSimilarPhotos(dimensions),
		[dimensions],
	);
	const lightboxPhotos = useMemo(() => {
		if (!lightboxPhotoKeys.length) {
			return dimensions;
		}
		const photosByKey = new Map(dimensions.map((photo) => [photo.key, photo]));
		return lightboxPhotoKeys
			.map((key) => photosByKey.get(key))
			.filter((photo): photo is GalleryPhoto => Boolean(photo));
	}, [dimensions, lightboxPhotoKeys]);

	const openLightbox = useCallback(
		(_event: MouseEvent<HTMLElement>, { photo, index }: LightboxArgs) => {
			const lightboxIndex =
				typeof (photo as GroupedGalleryPhoto).lightboxIndex === "number"
					? (photo as GroupedGalleryPhoto).lightboxIndex
					: index;
			const groupedPhoto = photo as GroupedGalleryPhoto;
			const memberIndices = Array.isArray(groupedPhoto.groupMemberIndices)
				? groupedPhoto.groupMemberIndices
				: [];
			if (memberIndices.length > 1) {
				const groupKeys = memberIndices
					.map((memberIndex) => dimensions[memberIndex]?.key)
					.filter((key): key is string => typeof key === "string");
				const groupedKeySet = new Set(groupKeys);
				const remainingKeys = dimensions
					.map((item) => item.key)
					.filter((key) => !groupedKeySet.has(key));
				setLightboxPhotoKeys([...groupKeys, ...remainingKeys]);
				setCurrentImage(0);
			} else {
				setLightboxPhotoKeys([]);
				setCurrentImage(lightboxIndex);
			}
			setViewerIsOpen(true);
		},
		[dimensions],
	);

	const updatePhotoDescription = useCallback((photoKey: string, description?: string) => {
		setDimensions((items) =>
			items.map((item) => (item.key === photoKey ? { ...item, description } : item)),
		);
	}, []);

	const showPreviousImage = useCallback(() => {
		setCurrentImage((index) => (index > 0 ? index - 1 : index));
	}, []);

	const showNextImage = useCallback(() => {
		setCurrentImage((index) => (index < lightboxPhotos.length - 1 ? index + 1 : index));
	}, [lightboxPhotos.length]);

	useEffect(() => {
		setDimensions(photos);
	}, [photos]);

	const currentPhoto = lightboxPhotos[currentImage] ?? null;
	const currentMetaUrl =
		viewerIsOpen && currentPhoto
			? buildApiPath("/api/meta", sectionId, folder, currentPhoto.path)
			: null;
	const {
		data: currentMeta,
		error: currentMetaError,
		mutate: mutateCurrentMeta,
	} = useSWR<MetaResponse>(currentMetaUrl, fetcher, {
		revalidateOnFocus: false,
	});
	const currentMetaDescription =
		typeof currentMeta?.description === "string" ? currentMeta.description : undefined;
	const currentMetaPhash = typeof currentMeta?.phash === "string" ? currentMeta.phash : undefined;
	const currentStoredMeta =
		currentMeta?.storedMeta && typeof currentMeta.storedMeta === "object"
			? currentMeta.storedMeta
			: null;

	useEffect(() => {
		if (!currentPhoto || currentMetaDescription === currentPhoto.description) {
			return;
		}
		updatePhotoDescription(currentPhoto.key, currentMetaDescription);
	}, [currentMetaDescription, currentPhoto, updatePhotoDescription]);

	useEffect(() => {
		if (!currentPhoto || currentMetaPhash === currentPhoto.phash) {
			return;
		}
		setDimensions((items) =>
			items.map((item) => (item.key === currentPhoto.key ? { ...item, phash: currentMetaPhash } : item)),
		);
	}, [currentMetaPhash, currentPhoto]);

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
			{error ? (
				<ErrorState
					message={`Failed to load photos for ${date === "undated" ? "undated photos" : date}.`}
					error={error}
					details={getErrorMessage(error)}
					onRetry={() => mutate()}
				/>
			) : null}
			{!data && !error && (
				<div className="flex min-h-[12rem] items-center justify-center rounded-3xl border border-dashed border-white/10 bg-slate-950/40">
					<Loading />
				</div>
			)}
			{data && !groupedPhotos.length && (
				<div className="rounded-3xl border border-dashed border-white/10 bg-slate-950/40 px-4 py-8 text-center text-sm text-slate-400">
					No photos matched this day.
				</div>
			)}
			{!!groupedPhotos.length && (
				<PhotoGallery
					photos={groupedPhotos}
					direction="column"
					columns={(containerWidth) => {
						if (containerWidth >= 1800) return 6;
						if (containerWidth >= 1400) return 5;
						if (containerWidth >= 1000) return 4;
						if (containerWidth >= 700) return 3;
						return 2;
					}}
					margin={2}
					onClick={openLightbox}
					renderImage={imageRenderer}
				/>
			)}
			<PhotoLightbox
				photos={lightboxPhotos}
				currentIndex={currentImage}
				isOpen={viewerIsOpen && !!currentPhoto}
				onClose={closeLightbox}
				onPrevious={showPreviousImage}
				onNext={showNextImage}
				sidebar={
					currentPhoto
						? {
								buttonLabel: "EXIF",
								title: currentPhoto.caption
									? `${currentPhoto.caption} metadata`
									: "Stored metadata",
								content: (
									<MetadataSidebar
										metadata={currentStoredMeta}
										meta={currentMeta}
										photo={currentPhoto}
										isLoading={Boolean(currentMetaUrl) && !currentMeta && !currentMetaError}
										error={currentMetaError}
										errorMessage={getErrorMessage(currentMetaError)}
										onRetry={currentMetaUrl ? () => mutateCurrentMeta() : undefined}
									/>
								),
							}
						: null
				}
				footer={
					currentPhoto ? (
						<DescriptionEditor
							sectionId={sectionId}
							folder={folder}
							photo={currentPhoto}
							onSaved={(description) => {
								updatePhotoDescription(currentPhoto.key, description);
							}}
						/>
					) : null
				}
			/>
		</div>
	);
}

function groupSequentialSimilarPhotos(photos: GalleryPhoto[]): GroupedGalleryPhoto[] {
	if (!photos.length) {
		return [];
	}

	const groups: {
		representative: GalleryPhoto;
		members: GalleryPhoto[];
		memberIndices: number[];
		startIndex: number;
	}[] = [];

	photos.forEach((photo, index) => {
		const currentGroup = groups.at(-1);
		if (!currentGroup) {
			groups.push({
				representative: photo,
				members: [photo],
				memberIndices: [index],
				startIndex: index,
			});
			return;
		}

		if (shouldGroupWithPreviousPhotos(currentGroup.members, photo)) {
			currentGroup.members.push(photo);
			currentGroup.memberIndices.push(index);
			return;
		}

		groups.push({
			representative: photo,
			members: [photo],
			memberIndices: [index],
			startIndex: index,
		});
	});

	return groups.map(({ representative, members, memberIndices, startIndex }) => ({
		...representative,
		lightboxIndex: startIndex,
		groupedPhotoCount: members.length,
		groupMemberIndices: memberIndices,
	}));
}

function shouldGroupWithPreviousPhotos(previousPhotos: GalleryPhoto[], currentPhoto: GalleryPhoto) {
	const currentHash = normalizePhash(currentPhoto.phash);
	if (!currentHash) {
		return false;
	}

	const nearbyPhotos = previousPhotos.slice(-MAX_SIMILAR_LOOKBACK);
	return nearbyPhotos.some((previousPhoto) => {
		const previousHash = normalizePhash(previousPhoto.phash);
		return previousHash ? hammingDistance(previousHash, currentHash) <= MAX_PHASH_DISTANCE : false;
	});
}

function normalizePhash(value?: string) {
	return typeof value === "string" && /^[0-9a-f]{16}$/i.test(value) ? value.toLowerCase() : null;
}

function hammingDistance(left: string, right: string) {
	let distance = 0;
	for (let index = 0; index < left.length; index += 1) {
		const leftDigit = Number.parseInt(left[index], 16);
		const rightDigit = Number.parseInt(right[index], 16);
		distance += bitCount(leftDigit ^ rightDigit);
	}
	return distance;
}

function bitCount(value: number) {
	let count = 0;
	let remaining = value;
	while (remaining > 0) {
		count += remaining & 1;
		remaining >>= 1;
	}
	return count;
}

interface DescriptionEditorProps {
	sectionId: number;
	folder: string;
	photo: GalleryPhoto;
	onSaved: (description?: string) => void;
}

function DescriptionEditor({ sectionId, folder, photo, onSaved }: DescriptionEditorProps) {
	const [draft, setDraft] = useState(photo.description ?? "");
	const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

	useEffect(() => {
		setDraft(photo.description ?? "");
		setSaveState("idle");
	}, [photo.key, photo.description]);

	const saveDescription = useCallback(async () => {
		setSaveState("saving");
		try {
			const response = await fetch(buildApiPath("/api/meta", sectionId, folder, photo.path), {
				method: "PATCH",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ description: draft }),
			});
			if (!response.ok) {
				throw new Error(`Failed to save description (${response.status})`);
			}
			const payload = (await response.json()) as { description?: string | null };
			const description =
				typeof payload.description === "string" ? payload.description : undefined;
			onSaved(description);
			setDraft(description ?? "");
			setSaveState("saved");
		} catch {
			setSaveState("error");
		}
	}, [draft, folder, onSaved, photo.path, sectionId]);

	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between gap-3">
				<div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
					Description
				</div>
				<div className="text-xs text-slate-500">
					{saveState === "saving"
						? "Saving..."
						: saveState === "saved"
							? "Saved"
							: saveState === "error"
								? "Save failed"
								: ""}
				</div>
			</div>
			<textarea
				value={draft}
				onChange={(event) => {
					setDraft(event.target.value);
					setSaveState("idle");
				}}
				placeholder="Add a searchable description for this image"
				rows={3}
				className="w-full rounded-2xl border border-white/10 bg-slate-900/90 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-sky-300/50"
			/>
			<div className="flex justify-end">
				<button
					type="button"
					onClick={() => void saveDescription()}
					disabled={saveState === "saving"}
					className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-200 transition hover:border-sky-300/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
				>
					Save description
				</button>
			</div>
		</div>
	);
}

interface SelectedImageProps {
	index: number;
	photo: GroupedGalleryPhoto;
	margin: string | number;
	left: number;
	top: number;
	selected?: boolean;
	onClick: (_event: MouseEvent<HTMLElement>, args: LightboxArgs) => void;
}

function SelectedImage({ index, photo, margin, left, top, selected, onClick }: SelectedImageProps) {
	const [isLoaded, setIsLoaded] = useState(false);
	const fileName = photo.path.split("/").at(-1) ?? photo.caption ?? "Photo";
	const dimensionLabel =
		photo.original?.width && photo.original?.height
			? `${photo.original.width.toFixed(0)} x ${photo.original.height.toFixed(0)}`
			: null;
	const containerStyle: CSSProperties = {
		backgroundColor: photo.dominantColor ?? "#0f172a",
		cursor: "pointer",
		height: photo.height,
		left,
		margin,
		overflow: "hidden",
		top,
		position: "absolute",
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
				onLoad={() => setIsLoaded(true)}
				onError={() => setIsLoaded(true)}
				width={photo.width}
				height={photo.height}
				loading="lazy"
				className={[
					"block h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]",
					isLoaded ? "opacity-100" : "opacity-0",
				].join(" ")}
			/>
			{!isLoaded ? (
				<div
					className="pointer-events-none absolute inset-0 animate-pulse"
					style={{ backgroundColor: photo.dominantColor ?? "#0f172a", opacity: 0.9 }}
				/>
			) : null}
			{photo.groupedPhotoCount > 1 ? (
				<div className="pointer-events-none absolute left-3 top-3 rounded-full border border-white/15 bg-slate-950/85 px-2 py-1 text-[11px] font-medium text-white shadow-lg shadow-black/30">
					{photo.groupedPhotoCount} similar
				</div>
			) : null}
			<div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent px-3 pb-3 pt-10">
				<PhashBitmap value={photo.phash} className="absolute right-3 top-3" />
				<div className="truncate text-sm font-medium text-white">{fileName}</div>
				<div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-300/80">
					{dimensionLabel ?? "Photo"}
				</div>
			</div>
		</div>
	);
}
