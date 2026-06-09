"use client";

import { useMemo, useState } from "react";
import { PhotoLightbox } from "./photo-lightbox";
import type { GalleryPhoto } from "./ui-types";
import { buildApiPath } from "./url-paths";

interface SearchResultPreviewGridProps {
	sectionName: string;
	previewFiles: string[];
}

export function SearchResultPreviewGrid({
	sectionName,
	previewFiles,
}: SearchResultPreviewGridProps) {
	const [currentIndex, setCurrentIndex] = useState(0);
	const [isOpen, setIsOpen] = useState(false);

	const photos = useMemo<GalleryPhoto[]>(
		() =>
			previewFiles.map((previewFile) => {
				const fileName = previewFile.split("/").at(-1) ?? previewFile;
				const src = buildApiPath("/api/photo", sectionName, previewFile);
				return {
					key: `${sectionName}:${previewFile}`,
					path: previewFile,
					src,
					source: {
						regular: src,
						fullscreen: buildApiPath("/api/thumb", sectionName, previewFile, "w1600-jpeg"),
						thumbnail: buildApiPath("/api/thumb", sectionName, previewFile),
					},
					width: 4,
					height: 3,
					caption: fileName,
					title: fileName,
				};
			}),
		[previewFiles, sectionName],
	);

	return (
		<>
			<div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
				{photos.map((photo, index) => (
					<button
						key={photo.key}
						type="button"
						onClick={() => {
							setCurrentIndex(index);
							setIsOpen(true);
						}}
						className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/60 transition hover:border-sky-300/30"
					>
						<img
							src={photo.source.thumbnail}
							alt={photo.caption ?? "Photo"}
							className="aspect-[4/3] h-full w-full object-cover"
							loading="lazy"
						/>
					</button>
				))}
			</div>
			<PhotoLightbox
				photos={photos}
				currentIndex={currentIndex}
				isOpen={isOpen}
				onClose={() => setIsOpen(false)}
				onPrevious={() => setCurrentIndex((index) => (index > 0 ? index - 1 : index))}
				onNext={() =>
					setCurrentIndex((index) => (index < photos.length - 1 ? index + 1 : index))
				}
			/>
		</>
	);
}
