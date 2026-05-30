import Head from "next/head";
import { useRouter } from "next/router";
import type { GetServerSideProps } from "next";
import config from "../lib/config.js";
import { GalleryFor } from "../components/gallery";
import { SectionFolders } from "../components/nav/section-folders";
import { SectionsNav } from "../components/nav/sections-nav";
import { firstQueryValue, type UISection } from "../components/ui-types";

interface HomeProps {
	sections: UISection[];
}

export default function Home({ sections = [] }: HomeProps) {
	const router = useRouter();
	const sectionQuery = firstQueryValue(router.query.section);
	const sectionId = Number.parseInt(sectionQuery ?? "", 10);
	const activeSectionId = Number.isInteger(sectionId) ? sectionId : -1;
	const section = sections[activeSectionId];
	const folder = firstQueryValue(router.query.folder) ?? "";
	const locationLabel = folder ? folder.split("/").join(" / ") : "Choose a folder to browse";

	return (
		<>
			<Head>
				<title>Travel Photo Album</title>
				<meta
					name="description"
					content="Browse your travel photos by destination, folder, and day."
				/>
				<link rel="icon" href="/favicon.ico" />
			</Head>

			<div className="relative overflow-hidden">
				<div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(circle_at_top,_rgba(125,211,252,0.18),_transparent_55%)]" />
				<main className="mx-auto flex min-h-screen w-full max-w-[1800px] flex-col gap-6 px-4 py-6 lg:px-6 xl:px-8">
					<header className="rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-2xl shadow-sky-950/20 backdrop-blur-xl">
						<div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
							<div className="max-w-3xl space-y-3">
								<div className="inline-flex items-center rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-sky-200">
									Travel Photo Album
								</div>
								<h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
									Your photo archive, organized like a polished gallery.
								</h1>
								<p className="max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
									Move between trips, drill into folders, and browse each day in a
									clean filmstrip-style layout optimized for large photo collections.
								</p>
							</div>
							<div className="grid gap-3 sm:grid-cols-2">
								<div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3">
									<div className="text-xs uppercase tracking-[0.2em] text-slate-400">
										Active section
									</div>
									<div className="mt-2 text-base font-medium text-white">
										{section?.name ?? "No section selected"}
									</div>
								</div>
								<div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3">
									<div className="text-xs uppercase tracking-[0.2em] text-slate-400">
										Current path
									</div>
									<div className="mt-2 truncate text-base font-medium text-slate-200">
										{locationLabel}
									</div>
								</div>
							</div>
						</div>
					</header>

					<div className="grid flex-1 gap-6 xl:grid-cols-[320px,minmax(0,1fr)]">
						<aside className="h-fit rounded-[2rem] border border-white/10 bg-slate-950/55 p-5 shadow-xl shadow-black/20 backdrop-blur xl:sticky xl:top-6">
							<div className="space-y-6">
								<section className="space-y-3">
									<div>
										<h2 className="text-lg font-semibold text-white">Trips</h2>
										<p className="text-sm text-slate-400">
											Select a travel collection to explore.
										</p>
									</div>
									<SectionsNav sections={sections} sectionId={activeSectionId} />
								</section>
								<section className="border-t border-white/10 pt-5">
									<SectionFolders section={section} folder={folder} />
								</section>
							</div>
						</aside>

						<section className="rounded-[2rem] border border-white/10 bg-slate-950/45 p-4 shadow-xl shadow-black/20 backdrop-blur sm:p-6">
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
		</>
	);
}

export const getServerSideProps: GetServerSideProps<HomeProps> = async () => {
	const sections = Array.isArray(config?.sections) ? config.sections : [];

	return {
		props: {
			sections: sections.map((section, index) => ({ ...section, id: index })),
		},
	};
};
