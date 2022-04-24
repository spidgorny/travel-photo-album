import useSWR from "swr";
import { fetcher } from "../../lib/http.js";

export default function TestMeta() {
	const {data} = useSWR('/api/meta/192.168.1.189/photo/Photos/2022/Marina-5t/2022-03/IMG_20220331_174617.jpg', fetcher);
	return <pre>{JSON.stringify(data, null, 2)}</pre>;
}
