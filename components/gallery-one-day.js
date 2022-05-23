import useSWR from "swr";
import { fetcher } from "../lib/http";
import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Loading } from "./widget/loading";
import Gallery from "react-photo-gallery";
import Carousel, { Modal, ModalGateway } from "react-images";
import Image from "next/image";
import { HStack } from "./widget/hstack";

export function GalleryOneDay({ sectionId, folder, date }) {
	let apiUrl = `/api/filesByDate/${sectionId}/${folder}/${date}`;
	const { data } = useSWR(apiUrl, fetcher);

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

	const photos = useMemo(() => {
		console.log("remap photos", date);
		return (
			data?.files?.map((x) => {
				let src = `/api/photo/${sectionId}/${folder}/${x.path}`;
				let thumbSrc = `/api/thumb/${sectionId}/${folder}/${x.path}`;
				return {
					...x,
					source: {
						regular: src,
						thumbnail: thumbSrc,
					},
					width: 3,
					height: 2,
					// caption: x.path.split("/").slice(-1)[0],
					caption: src,
				};
			}) ?? []
		);
	}, [data]);
	const [dimensions, setDimensions] = useState(photos);

	useEffect(() => {
		console.log("remap dimensions", date);

		async function fetchDimensions() {
			for (let [index, img] of photos.entries()) {
				// console.log("dimensions", dimensions.length);
				const { data } = await axios.get(
					`/api/meta/${sectionId}/${img.dirPath}`
				);
				if (!data) {
					return;
				}
				if (date === "2020-07-26") {
					console.log(data);
				}
				const width = data?.COMPUTED?.Width ?? data?.dimensions?.width ?? 3;
				const height = data?.COMPUTED?.Height ?? data?.dimensions?.height ?? 2;
				const newDim = {
					...img,
					...data,
					width,
					height,
					original: { width, height },
				};
				if (date === "2020-07-26") {
					console.log(data, newDim);
				}
				setDimensions((old) => [
					...(old.length ? old : photos).map((x, i) =>
						i === index ? newDim : x
					),
				]);
			}
		}

		fetchDimensions();
	}, [photos]);

	const imageRenderer = (props) => {
		// caption: "IMG_20220406_142852.jpg"
		// date: "2022-04-05T22:00:00.000Z"
		// dirPath: "IMG_20220406_142852.jpg"
		// fullPath: "\\media\\nas\\photo\\Photos\\2022\\Marina-5t\\2022-04\\IMG_20220406_142852.jpg"
		// height: 240.35087719298244
		// path: "IMG_20220406_142852.jpg"
		// src: "/api/photo/2/IMG_20220406_142852.jpg"
		// width: 319.7
		// console.log(photo);
		const { index, left, top, key, photo } = props;
		if (index === 0) {
			// console.log(props);
		}
		return (
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
		);
	};

	return (
		<div>
			<div>
				apiUrl: <a href={apiUrl}>{apiUrl}</a>
			</div>
			<div>data?.files?: {data?.files?.length}</div>
			<div>Dimensions: {dimensions.length}</div>
			{!data && <Loading />}
			{dimensions && (
				<Gallery
					photos={dimensions}
					onClick={openLightbox}
					renderImage={imageRenderer}
				/>
			)}
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

function SelectedImage(props) {
	const cont = {
		backgroundColor: "#eee",
		cursor: "pointer",
		overflow: "hidden",
		position: "relative",
		border: "solid 3px white",
	};
	const { index, photo, margin, direction, top, left, selected, onClick } =
		props;
	// console.log(props);
	const imgStyle = {};
	const selectedImgStyle = {};
	return (
		<div
			style={{ margin, height: photo.height + 30, width: photo.width, ...cont }}
			className={!selected ? "not-selected" : ""}
		>
			<Image
				src={photo.source.regular}
				title={photo.title ?? photo.caption}
				alt={photo.title ?? photo.caption}
				style={
					selected ? { ...imgStyle, ...selectedImgStyle } : { ...imgStyle }
				}
				onClick={(e) => onClick(e, { photo, index })}
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
