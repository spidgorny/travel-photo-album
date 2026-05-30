import axios from "axios";
import type { CSSProperties, ComponentType, MouseEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import Carousel, { Modal, ModalGateway } from "react-images";
import Gallery from "react-photo-gallery";
import { fetcher } from "../lib/http";
import { HStack } from "./widget/hstack";
import { Loading } from "./widget/loading";
import type { FilesResponse, GalleryPhoto, MetaResponse } from "./ui-types";

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
	onClick: (_event: MouseEvent<HTMLElement>, args: LightboxArgs) => void;
	renderImage: (props: ImageRendererProps) => ReactNode;
};

const PhotoGallery = Gallery as unknown as ComponentType<PhotoGalleryComponentProps>;
const SafeModalGateway = ModalGateway as unknown as ComponentType<{ children?: ReactNode }>;

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
		console.log("remap photos", date);
		const files = Array.isArray(data?.files) ? data.files : [];

		return files.map((file) => {
			const filePath = typeof file.path === "string" ? file.path : "";
			const src = `/api/photo/${sectionId}/${folder}/${filePath}`;
			const thumbSrc = `/api/thumb/${sectionId}/${folder}/${filePath}`;

			return {
				...file,
				source: {
					regular: src,
					thumbnail: thumbSrc,
				},
				width: 3,
				height: 2,
				caption: src,
			};
		});
	}, [data, date, folder, sectionId]);

	const [dimensions, setDimensions] = useState<GalleryPhoto[]>(photos);

	useEffect(() => {
		console.log("remap dimensions", date);
		setDimensions(photos);

		let cancelled = false;

		async function fetchDimensions() {
			if (!photos.length) {
				setDimensions([]);
				return;
			}

			for (const [index, img] of photos.entries()) {
				const metaUrl = `/api/meta/${sectionId}/${img.dirPath ?? img.path}`;
				const { data: meta } = await axios.get<MetaResponse>(metaUrl);

				if (!meta || cancelled) {
					if (cancelled) {
						return;
					}
					continue;
				}

				if (date === "2020-07-26") {
					console.log(meta);
				}

				const width =
					meta.COMPUTED?.Width ?? meta.COMPUTED?.width ?? meta.dimensions?.width ?? 3;
				const height =
					meta.COMPUTED?.Height ?? meta.COMPUTED?.height ?? meta.dimensions?.height ?? 2;
				const newDim: GalleryPhoto = {
					...img,
					...meta,
					width,
					height,
					original: { width, height },
				};

				if (date === "2020-07-26") {
					console.log(meta, newDim);
				}

				setDimensions((old) => {
					const baseline = old.length ? old : photos;
					return baseline.map((photo, photoIndex) => (photoIndex === index ? newDim : photo));
				});
			}
		}

		void fetchDimensions();

		return () => {
			cancelled = true;
		};
	}, [date, photos, sectionId]);

	const imageRenderer = (props: ImageRendererProps) => {
		const { index, left, top, key, photo } = props;

		return (
			<SelectedImage
				key={key}
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
		<div>
			<div>
				apiUrl: <a href={apiUrl}>{apiUrl}</a>
			</div>
			<div>data?.files?: {data?.files?.length ?? 0}</div>
			<div>Dimensions: {dimensions.length}</div>
			{!data && <Loading />}
			{!!dimensions.length && (
				<PhotoGallery
					photos={dimensions}
					onClick={openLightbox}
					renderImage={imageRenderer}
				/>
			)}
			<SafeModalGateway>
				{viewerIsOpen ? (
					<Modal onClose={closeLightbox}>
						<Carousel
							currentIndex={currentImage}
							views={photos.map((photo) => ({ ...photo }))}
						/>
					</Modal>
				) : null}
			</SafeModalGateway>
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
	const cont: CSSProperties = {
		backgroundColor: "#eee",
		cursor: "pointer",
		overflow: "hidden",
		position: "relative",
		border: "solid 3px white",
	};
	const imgStyle: CSSProperties = {};
	const selectedImgStyle: CSSProperties = {};

	return (
		<div
			style={{ margin, height: photo.height + 30, width: photo.width, ...cont }}
			className={!selected ? "not-selected" : ""}
		>
			<img
				src={photo.source.regular}
				title={photo.title ?? photo.caption}
				alt={photo.title ?? photo.caption}
				style={selected ? { ...imgStyle, ...selectedImgStyle } : { ...imgStyle }}
				onClick={(event) => onClick(event, { photo, index })}
				width={photo.width}
				height={photo.height}
			/>
			<style>{`.not-selected:hover{outline:2px solid #06befa}`}</style>
			<HStack className="text-black">
				<div>{photo.source.regular.split("/").slice(-1)[0]}</div>
				<div>
					{photo.original?.width?.toFixed(0)}x
					{photo.original?.height?.toFixed(0)}
				</div>
			</HStack>
		</div>
	);
}
