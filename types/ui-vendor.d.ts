declare module "next-auth/react" {
	export function useSession(): {
		data: unknown | null | undefined;
	};
}

declare module "react-photo-gallery" {
	import type { ComponentType, MouseEvent, ReactNode } from "react";

	export interface PhotoClickEvent<TPhoto = Record<string, unknown>> {
		photo: TPhoto;
		index: number;
		previous?: TPhoto;
		next?: TPhoto;
	}

	export interface RenderImageProps<TPhoto = Record<string, unknown>> {
		index: number;
		left: number;
		top: number;
		key?: string;
		margin?: string | number;
		direction?: "row" | "column";
		photo: TPhoto;
	}

	export interface GalleryProps<TPhoto = Record<string, unknown>> {
		photos: TPhoto[];
		onClick?: (
			event: MouseEvent<HTMLElement>,
			args: PhotoClickEvent<TPhoto>,
		) => void;
		renderImage?: (props: RenderImageProps<TPhoto>) => ReactNode;
	}

	const Gallery: ComponentType<GalleryProps>;
	export default Gallery;
}

export interface UISection { id: number; name: string; path: string; }
