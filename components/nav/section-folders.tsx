import { useEffect, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { fetcher } from "../../lib/http";
import type { FilesApiEntry, FilesResponse, UISection } from "../ui-types";

function joinFolderPath(parentPath: string, childPath: string) {
	return [parentPath, childPath].filter(Boolean).join("/");
}

function isActiveBranch(activeFolder: string, folderPath: string) {
	return activeFolder === folderPath || activeFolder.startsWith(`${folderPath}/`);
}

interface SectionFoldersProps {
	section?: UISection;
	folder?: string;
}

export function SectionFolders({ section, folder = "" }: SectionFoldersProps) {
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

interface SubFoldersProps {
	section: UISection;
	activeFolder: string;
	thePath: string;
}

export function SubFolders({ section, activeFolder, thePath }: SubFoldersProps) {
	const { data } = useSWR<FilesResponse>(`/api/files/${section.id}/${thePath}`, fetcher);
	const files = Array.isArray(data?.files) ? data.files : [];
	const dirs = files.filter((file): file is FilesApiEntry => Boolean(file?.isDir));

	if (!dirs.length) {
		return null;
	}

	return (
		<ul>
			{dirs.map((folderEntry) => (
				<FolderNode
					key={folderEntry.path}
					activeFolder={activeFolder}
					folderName={folderEntry.path}
					parentPath={thePath}
					section={section}
				/>
			))}
		</ul>
	);
}

interface FolderNodeProps {
	activeFolder: string;
	folderName: string;
	parentPath: string;
	section: UISection;
}

function FolderNode({ activeFolder, folderName, parentPath, section }: FolderNodeProps) {
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
				<SubFolders section={section} activeFolder={activeFolder} thePath={folderPath} />
			)}
		</li>
	);
}
