import useSWR from "swr";
import { fetcher } from "../lib/http";
import { GalleryOneDay } from "./gallery-one-day";
import { Loading } from "./widget/loading";
import type { DatesResponse, UISection } from "./ui-types";

interface GalleryForProps {
	section: UISection;
	folder?: string;
}

export function GalleryFor({ section, folder = "" }: GalleryForProps) {
	const apiUrl = `/api/dates/${section.id}/${folder}`;
	console.log("GalleryFor", { apiUrl });
	const { data } = useSWR<DatesResponse>(apiUrl, fetcher);

	if (!data) {
		return <Loading />;
	}

	const dates = Object.entries(data.dates ?? {});
	const isSSR = typeof window === "undefined";

	return (
		<div>
			{dates.map(([date, count]) => (
				<div key={date}>
					<h3>
						{date} ({count})
					</h3>
					{!isSSR && (
						<GalleryOneDay sectionId={section.id} folder={folder} date={date} />
					)}
					<hr />
				</div>
			))}
		</div>
	);
}
