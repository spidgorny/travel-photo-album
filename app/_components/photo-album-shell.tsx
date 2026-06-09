"use client";

import { AppHeader } from "./app-header";
import { GalleryFor } from "./gallery";
import { SectionFolders } from "./nav/section-folders";
import type { UISection } from "./ui-types";

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
							<div className="flex min-h-[28rem] flex-col items-center justify-center rounded-[1.5rem] border border-dashed border-white/10 bg-slate-900/40 px-6 text-center">
								<div className="max-w-md space-y-3">
									<h2 className="text-2xl font-semibold text-white">Start with a trip</h2>
									<p className="text-sm leading-6 text-slate-400">
										Choose a section on the left to load folders and browse the
										photo timeline for that destination.
									</p>
								</div>
							</div>
						)}
					</section>
				</div>
			</main>
		</div>
	);
}
