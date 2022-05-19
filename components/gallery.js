import { fetcher } from "../lib/http";
import useSWR from "swr";
import { Loading } from "./widget/loading.js";
import { GalleryOneDay } from "./gallery-one-day";

export function GalleryFor({ section, folder }) {
	let apiUrl = `/api/dates/${section.id}/${folder}`;
	console.log({ apiUrl });
	const { data } = useSWR(apiUrl, fetcher);

	if (!data) {
		return <Loading />;
	}

	let dates = Object.entries(data?.dates);
	// dates = dates.slice(0, 2);
	const isSSR = typeof window === "undefined";

	return (
		<div>
			{dates.map(([date, count]) => (
				<div key={date}>
					<h3>
						{date} ({count})
					</h3>
					{!isSSR && <GalleryOneDay sectionId={section.id} date={date} />}
					<hr />
				</div>
			))}
		</div>
	);
}
