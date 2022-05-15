import useSWR from "swr";
import { fetcher } from "../lib/http";
import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Loading } from "./widget/loading";
import Gallery from "react-photo-gallery";
import Carousel, { Modal, ModalGateway } from "react-images";
import Image from "next/image";

export function GalleryOneDay({ sectionId, date }) {
	const { data } = useSWR(`/api/filesByDate/${sectionId}/${date}`, fetcher);

	const [currentImage, setCurrentImage] = useState(0);
	const [viewerIsOpen, setViewerIsOpen] = useState(false);

	const openLightbox = useCallback((event, { photo, index }) => {
		setCurrentImage(index);
		setViewerIsOpen(true);
	}, []);

	const closeLightbox = () => {
		setCurrentImage(0);
		setViewerIsOpen(false);
	};

	const photos = useMemo(
		() =>
			data?.files?.map((x) => ({
				...x,
				src: `/api/photo/${sectionId}/${x.path}`,
				width: 4,
				height: 3,
				caption: x.path.split("/").slice(-1)[0],
			})) ?? [],
		[data]
	);
	const [dimensions, setDimensions] = useState(photos);

	useEffect(() => {
		async function fetchDimensions() {
			for (let [index, img] of photos.entries()) {
				console.log("dimensions", dimensions.length);
				const { data } = await axios.get(`/api/exif/${sectionId}/${img.path}`);
				if (data) {
					const newDim = [...photos.map((x, index) => dimensions[index] ?? x)];
					newDim[index] = {
						...img,
						...data,
					};
					setDimensions(newDim);
				}
			}
		}

		fetchDimensions();
	}, [photos]);

	const imageRenderer = useCallback(
		({ index, left, top, key, photo }) => (
			<SelectedImage
				// selected={selectAll ? true : false}
				key={key}
				margin={"2px"}
				index={index}
				photo={photo}
				left={left}
				top={top}
				onClick={openLightbox}
			/>
		),
		[]
	);

	if (!data) {
		return <Loading />;
	}

	return (
		<div>
			<Gallery
				photos={dimensions}
				onClick={openLightbox}
				renderImage={imageRenderer}
			/>
			<ModalGateway>
				{viewerIsOpen ? (
					<Modal onClose={closeLightbox}>
						<Carousel
							currentIndex={currentImage}
							views={photos.map((x) => ({
								...x,
							}))}
						/>
					</Modal>
				) : null}
			</ModalGateway>
		</div>
	);
}

function SelectedImage({
	index,
	photo,
	margin,
	direction,
	top,
	left,
	selected,
	onClick,
}) {
	const cont = {
		backgroundColor: "#eee",
		cursor: "pointer",
		overflow: "hidden",
		position: "relative",
	};
	const imgStyle = {};
	const selectedImgStyle = {};
	return (
		<div
			style={{ margin, height: photo.height, width: photo.width, ...cont }}
			className={!selected ? "not-selected" : ""}
		>
			<Image
				alt={photo.title}
				style={
					selected ? { ...imgStyle, ...selectedImgStyle } : { ...imgStyle }
				}
				{...photo}
				onClick={(e) => onClick(e, { photo, index })}
				width={photo.width}
				height={photo.height}
			/>
			<style>{`.not-selected:hover{outline:2px solid #06befa}`}</style>
		</div>
	);
}
