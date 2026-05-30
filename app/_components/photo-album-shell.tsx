"use client";

import { useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { GalleryFor } from "./gallery";
import { InfoSidebar } from "./info-sidebar";
import { SectionFolders } from "./nav/section-folders";
import { QueueProgressWidget } from "./queue-progress-widget";
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
	const router = useRouter();
	const [isInfoOpen, setIsInfoOpen] = useState(false);
	const sectionId = Number.parseInt(initialSectionQuery ?? "", 10);
	const activeSectionId = Number.isInteger(sectionId) ? sectionId : -1;
	const section = sections[activeSectionId];
	const folder = initialFolder;
	const locationLabel = folder ? folder.split("/").join(" / ") : "Choose a folder to browse";
	const selectedSectionValue = activeSectionId >= 0 ? String(activeSectionId) : "";

	const handleSectionChange = (event: ChangeEvent<HTMLSelectElement>) => {
		const nextSection = event.target.value;
		if (!nextSection) {
			router.push("/");
			return;
		}

		router.push(`/?section=${nextSection}`);
	};

	return (
		<div className="relative overflow-hidden">
			<div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(circle_at_top,_rgba(125,211,252,0.18),_transparent_55%)]" />
			<InfoSidebar
				isOpen={isInfoOpen}
				onClose={() => setIsInfoOpen(false)}
				activeCollection={section?.name}
				activeFolder={folder}
			/>
			<main className="mx-auto flex min-h-screen w-full max-w-[1800px] flex-col gap-5 px-4 py-5 lg:px-6 xl:px-8">
				<header className="rounded-[1.75rem] border border-white/10 bg-white/5 px-5 py-4 shadow-2xl shadow-sky-950/20 backdrop-blur-xl">
					<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
						<div className="max-w-xl space-y-2">
							<div className="flex flex-wrap items-center gap-2">
								<div className="inline-flex items-center rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-sky-200">
									Travel Photo Album
								</div>
								<button
									type="button"
									onClick={() => setIsInfoOpen(true)}
									className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-slate-200 transition hover:border-sky-300/30 hover:text-white"
								>
									<span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-sky-300/30 bg-sky-300/10 text-[11px] text-sky-100">
										i
									</span>
									Info
								</button>
							</div>
							<h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
								Browse your travel archive in one place.
							</h1>
							<p className="text-sm leading-6 text-slate-300">
								Switch trips from the header, expand the folder tree, and scan
								each day side by side with the gallery.
							</p>
						</div>
						<div className="flex min-w-0 flex-col gap-3 lg:w-[44rem] lg:flex-row lg:items-center">
							<QueueProgressWidget />
							<label className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 lg:w-[19rem] lg:shrink-0">
								<div className="text-xs uppercase tracking-[0.2em] text-slate-400">
									Travel collection
								</div>
								<select
									value={selectedSectionValue}
									onChange={handleSectionChange}
									className="mt-2 w-full rounded-xl border border-white/10 bg-slate-900/90 px-3 py-2.5 text-sm font-medium text-white outline-none transition focus:border-sky-300/50"
								>
									<option value="">Select a travel collection</option>
									{sections.map((candidateSection, index) => (
										<option key={candidateSection.id ?? index} value={index}>
											{candidateSection.name}
										</option>
									))}
								</select>
							</label>
							<div className="min-w-0 rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 lg:flex-1">
								<div className="text-xs uppercase tracking-[0.2em] text-slate-400">
									Current path
								</div>
								<div className="mt-2 truncate text-sm font-medium text-slate-200">
									{locationLabel}
								</div>
							</div>
						</div>
					</div>
				</header>

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
