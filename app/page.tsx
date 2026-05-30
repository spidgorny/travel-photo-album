import config from "../lib/config";
import { PhotoAlbumShell } from "./_components/photo-album-shell";
import { firstQueryValue, type UISection } from "./_components/ui-types";

interface HomePageProps {
	searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function HomePage({ searchParams }: HomePageProps) {
	const resolvedSearchParams = (await searchParams) ?? {};
	const sections = (Array.isArray(config?.sections) ? config.sections : []).map(
		(section, index) => ({
			...section,
			id: index,
		}),
	) as UISection[];
	const sectionQuery = firstQueryValue(resolvedSearchParams.section);
	const folder = firstQueryValue(resolvedSearchParams.folder) ?? "";

	return (
		<PhotoAlbumShell
			sections={sections}
			initialSectionQuery={sectionQuery}
			initialFolder={folder}
		/>
	);
}
