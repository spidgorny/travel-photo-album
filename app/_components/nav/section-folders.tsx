"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { fetcher } from "../../../lib/http";
import type { FilesApiEntry, FilesResponse, UISection } from "../ui-types";
import { buildApiPath, buildHomeHref } from "../url-paths";

const folderNameCollator = new Intl.Collator(undefined, {
	numeric: true,
	sensitivity: "base",
});

function joinFolderPath(parentPath: string, childPath: string) {
	return [parentPath, childPath].filter(Boolean).join("/");
}

function isActiveBranch(activeFolder: string, folderPath: string) {
	return activeFolder === folderPath || activeFolder.startsWith(`${folderPath}/`);
}

function labelFromFolder(folderPath: string) {
	return (
		folderPath
			.split("/")
			.filter(Boolean)
			.at(-1)
			?.replace(/[-_]+/g, " ") ?? folderPath
	);
}

interface SectionFoldersProps {
	section?: UISection;
	folder?: string;
}

export function SectionFolders({ section, folder = "" }: SectionFoldersProps) {
	if (!section) {
		return (
			<div className="space-y-3">
				<div>
					<h2 className="text-lg font-semibold text-white">Folders</h2>
					<p className="text-sm text-slate-400">
						Select a trip first to browse the folder tree.
					</p>
				</div>
			</div>
		);
	}

	const activeFolder = typeof folder === "string" ? folder : "";

	return (
		<div className="space-y-3">
			<div>
				<h2 className="text-lg font-semibold text-white">Folders</h2>
				<p className="text-sm text-slate-400">
					Expand branches lazily and jump straight to a folder timeline.
				</p>
			</div>
			<div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
				<SubFolders section={section} activeFolder={activeFolder} thePath="" />
			</div>
		</div>
	);
}

interface SubFoldersProps {
	section: UISection;
	activeFolder: string;
	thePath: string;
}

export function SubFolders({ section, activeFolder, thePath }: SubFoldersProps) {
	const { data } = useSWR<FilesResponse>(buildApiPath("/api/files", section.id, thePath), fetcher);
	const files = Array.isArray(data?.files) ? data.files : [];
	const dirs = files
		.filter((file): file is FilesApiEntry => Boolean(file?.isDir))
		.sort((firstDir, secondDir) =>
			folderNameCollator.compare(firstDir.path, secondDir.path),
		);

	if (!data) {
		return (
			<div className="flex items-center gap-3 rounded-2xl border border-dashed border-white/10 bg-slate-950/40 px-3 py-4 text-sm text-slate-400">
				<div className="h-2 w-2 animate-pulse rounded-full bg-sky-300" />
				Loading folders...
			</div>
		);
	}

	if (!dirs.length) {
		return thePath ? null : (
			<div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/40 px-3 py-4 text-sm text-slate-400">
				No folders found in this section.
			</div>
		);
	}

	return (
		<ul className={thePath ? "mt-2 space-y-2 border-l border-white/10 pl-4" : "space-y-2"}>
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

function FolderNode({
	activeFolder,
	folderName,
	parentPath,
	section,
}: FolderNodeProps) {
	const folderPath = joinFolderPath(parentPath, folderName);
	const isActive = isActiveBranch(activeFolder, folderPath);
	const [isOpen, setIsOpen] = useState(isActive);

	useEffect(() => {
		if (isActive) {
			setIsOpen(true);
		}
	}, [isActive]);

	return (
		<li>
			<div
				className={[
					"group flex items-center gap-2 rounded-2xl border px-2 py-2 transition",
					isActive
						? "border-sky-400/30 bg-sky-400/10"
						: "border-transparent bg-transparent hover:border-white/10 hover:bg-white/[0.04]",
				].join(" ")}
			>
				<button
					className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-slate-950/70 text-slate-300 transition hover:border-sky-300/30 hover:text-white"
					onClick={() => setIsOpen((open) => !open)}
					type="button"
					aria-label={isOpen ? `Collapse ${folderName}` : `Expand ${folderName}`}
				>
					<span
						className={[
							"text-xs transition-transform",
							isOpen ? "rotate-90 text-sky-200" : "",
						].join(" ")}
					>
						&gt;
					</span>
				</button>
				<Link
					href={buildHomeHref(section.id, folderPath)}
					className="min-w-0 flex-1 rounded-xl px-2 py-1"
				>
					<div className="truncate text-sm font-medium text-white">
						{labelFromFolder(folderPath)}
					</div>
					<div className="truncate text-xs text-slate-400">{folderPath}</div>
				</Link>
			</div>
			{isOpen && (
				<SubFolders section={section} activeFolder={activeFolder} thePath={folderPath} />
			)}
		</li>
	);
}
