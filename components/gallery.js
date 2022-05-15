import { fetcher } from "../lib/http";
import useSWR from "swr";
import { Loading } from "./widget/loading.js";
import { GalleryOneDay } from "./gallery-one-day";

export function GalleryFor({sectionId, section}) {
  const {data} = useSWR(`/api/dates/${sectionId}`, fetcher);

  if (!data) {
    return <Loading/>;
  }

  const dates = Object.entries(data?.dates).slice(0, 2)

  return (
    <div>
      {dates.map(([date, count]) => (
        <div key={date}>
          <h3>
            {date} ({count})
          </h3>
          <GalleryOneDay sectionId={sectionId} date={date}/>
          <hr/>
        </div>
      ))}
    </div>
  );
}
