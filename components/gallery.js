import Gallery from "react-photo-gallery";
import { fetcher } from "../lib/http";
import useSWR from "swr";
import { Loading } from "./widget/loading.js";
import Carousel, { Modal, ModalGateway } from "react-images";
import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import axios from "axios";

export function GalleryFor({ sectionId, section }) {
  const { data } = useSWR("/api/dates?section=" + sectionId, fetcher);

  if (!data) {
    return <Loading />;
  }

  return (
    <div>
      {data?.dates.map((x) => (
        <div key={x}>
          <h3>{x}</h3>
          <GalleryOneDay sectionId={sectionId} date={x} />
          <hr />
        </div>
      ))}
    </div>
  );
}

export function GalleryOneDay({ sectionId, date }) {
  const { data } = useSWR(
    `/api/filesByDate?date=${date}&section=${sectionId}`,
    fetcher
  );

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

  const photos =
    data?.files?.map((x) => ({
      src: "/api/photo/" + x,
      width: 4,
      height: 3,
    })) ?? [];
  const [dimensions, setDimensions] = useState(photos);

  useEffect(() => {
    async function fetchDimensions() {
      for (let [index, img] of photos.entries()) {
        console.log("dimensions", dimensions.length);
        const res = await axios.get(img.src);
        setDimensions([
          ...dimensions,
          {
            ...img,
            ...res.data.dimensions,
          },
        ]);
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
                srcset: x.srcSet,
                caption: x.title,
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
      <img
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
