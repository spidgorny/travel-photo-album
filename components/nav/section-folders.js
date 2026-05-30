import { useEffect, useState } from "react";
import useSWR from "swr";
import { fetcher } from "../../lib/http";
import Link from "next/link";

function joinFolderPath(parentPath, childPath) {
	return [parentPath, childPath].filter(Boolean).join("/");
}

function isActiveBranch(activeFolder, folderPath) {
	return (
		activeFolder === folderPath || activeFolder.startsWith(`${folderPath}/`)
	);
}

export function SectionFolders({ section, folder = "" }) {
	if (!section) {
		return null;
	}

	const activeFolder = typeof folder === "string" ? folder : "";

	return (
		<>
			<div>Folders</div>
			<SubFolders section={section} activeFolder={activeFolder} thePath="" />
		</>
	);
}

export function SubFolders({ section, activeFolder, thePath }) {
	const { data } = useSWR(`/api/files/${section.id}/${thePath}`, fetcher);
	const dirs = data?.files?.filter((x) => x.isDir) ?? [];

	if (!dirs.length) {
		return null;
	}

	return (
		<ul>
			{dirs.map((x) => (
				<FolderNode
					key={x.path}
					activeFolder={activeFolder}
					folderName={x.path}
					parentPath={thePath}
					section={section}
				/>
			))}
		</ul>
	);
}

function FolderNode({ activeFolder, folderName, parentPath, section }) {
	const folderPath = joinFolderPath(parentPath, folderName);
	const isActive = isActiveBranch(activeFolder, folderPath);
	const [isOpen, setIsOpen] = useState(isActive);

	useEffect(() => {
		if (isActive) {
			setIsOpen(true);
		}
	}, [isActive]);

	return (
		<li className={isActive ? "active" : ""}>
			<button
				className="btn btn-sm btn-outline-light me-2 py-0 px-1"
				onClick={() => setIsOpen((open) => !open)}
				type="button"
			>
				{isOpen ? "Close" : "Open"}
			</button>
			<Link
				href={`/?section=${section.id}&folder=${folderPath}`}
				className={isActive ? "active text-white" : ""}
			>
				{folderName}
			</Link>
			{isOpen && (
				<SubFolders
					section={section}
					activeFolder={activeFolder}
					thePath={folderPath}
				/>
			)}
		</li>
	);
}
