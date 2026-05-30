import useSWR from "swr";
import { fetcher } from "../../lib/http";
import Link from "next/link";
import { useRouter } from "next/router.js";
import path from "path";

export function SectionFolders({ section }) {
	if (!section) {
		return null;
	}

	return (
		<>
			<div>Folders</div>
			<SubFolders section={section} thePath={""} />
		</>
	);
}

export function SubFolders({ section, thePath }) {
	const { data } = useSWR(`/api/files/${section.id}/${thePath}`, fetcher);
	const dirs = data?.files?.filter((x) => x.isDir) ?? [];

	const router = useRouter();
	const { folder } = router.query;
	const activeFolder = typeof folder === "string" ? folder : "";

	if (!dirs.length) {
		return null;
	}

	return (
		<ul>
			{dirs.map((x) => {
				let pathJoined = path.join(thePath, x.path);
				const isActive = activeFolder.includes(pathJoined);
				return (
					<li key={x.path} className={isActive ? "active" : ""}>
						<Link href={`/?section=${section.id}&folder=${pathJoined}`} key={x.path} className={isActive ? "active" +
							" text-white" : ""}>
								{x.path}
						</Link>
						<SubFolders section={section} thePath={pathJoined} />
					</li>
				);
			})}
		</ul>
	);
}
