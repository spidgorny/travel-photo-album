import useSWR from "swr";
import { fetcher } from "../../lib/http";
import Link from "next/link";
import { useRouter } from "next/router.js";

export function SectionFolders({ section }) {
	const { data } = useSWR(`/api/files/${section.id}`, fetcher);
	const dirs = data?.files?.filter((x) => x.isDir) ?? [];

	const router = useRouter();
	const { folder } = router.query;

	return (
		<>
			<div>Folders</div>
			<ul>
				{dirs.map((x) => {
					const isActive = folder === x.path;
					return (
						<li key={x.path} className={isActive ? "active" : ""}>
							<Link href={`/?section=${section.id}&folder=${x.path}`}>
								<a key={x.path} className={isActive ? "active text-white" : ""}>
									{x.path}
								</a>
							</Link>
						</li>
					);
				})}
			</ul>
		</>
	);
}
