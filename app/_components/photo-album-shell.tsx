"use client";

import Link from "next/link";
import { AppHeader } from "./app-header";
import { GalleryFor } from "./gallery";
import { SectionFolders } from "./nav/section-folders";
import type { UISection } from "./ui-types";
import { buildHomeHref } from "./url-paths";

interface PhotoAlbumShellProps {
	sections: UISection[];
	initialSectionQuery?: string;
	initialFolder?: string;
}

export function PhotoAlbumShell({
	sections,
	initialSectionQuery,
	initialFolder = "",
}: PhotoAlbumShellProps) {
	const section = sections.find((s) => s.name === initialSectionQuery);
	const activeSectionId = section?.id ?? -1;
	const folder = initialFolder;
	const locationLabel = folder ? folder.split("/").join(" / ") : "Choose a folder to browse";

	return (
		<div className="relative overflow-hidden">
			<div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(circle_at_top,_rgba(125,211,252,0.18),_transparent_55%)]" />
			<main className="mx-auto flex min-h-screen w-full max-w-[1800px] flex-col gap-5 px-4 py-5 lg:px-6 xl:px-8">
				<AppHeader
					sections={sections}
					activeSectionId={activeSectionId}
					activeFolder={folder}
					contextLabel="Current path"
					contextValue={locationLabel}
				/>

				<div className="flex flex-1 flex-col gap-5 md:flex-row md:items-start">
					<aside className="h-fit rounded-[1.75rem] border border-white/10 bg-slate-950/55 p-4 shadow-xl shadow-black/20 backdrop-blur md:sticky md:top-5 md:w-[320px] md:shrink-0">
						<SectionFolders section={section} folder={folder} />
					</aside>

					<section className="min-w-0 flex-1 rounded-[1.75rem] border border-white/10 bg-slate-950/45 p-4 shadow-xl shadow-black/20 backdrop-blur sm:p-5">
						{section ? (
							<GalleryFor section={section} folder={folder} />
						) : (
							<SectionPicker sections={sections} />
						)}
					</section>
				</div>
			</main>
		</div>
	);
}

function SectionPicker({ sections }: { sections: UISection[] }) {
	return (
		<div className="space-y-6 p-2">
			<div>
				<h2 className="text-2xl font-semibold text-white">Choose a collection</h2>
				<p className="mt-1 text-sm text-slate-400">
					Select a travel collection to browse its photo timeline.
				</p>
			</div>
			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
				{sections.map((s) => (
					<Link
						key={s.id}
						href={buildHomeHref(s.name)}
						className="group flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/3 p-5 transition hover:border-sky-400/30 hover:bg-sky-400/5"
					>
						<div className="flex items-center gap-3">
							<span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-slate-950/70 text-xs font-bold text-sky-300 group-hover:border-sky-300/30">
								{String(s.id).padStart(2, "0")}
							</span>
							<span className="truncate text-sm font-semibold text-white">
								{s.name}
							</span>
						</div>
						{s.path ? (
							<p className="truncate text-xs text-slate-500">{s.path}</p>
						) : null}
					</Link>
				))}
			</div>
		</div>
	);
}
