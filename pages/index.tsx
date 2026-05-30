import Head from "next/head";
import type { ChangeEvent } from "react";
import { useRouter } from "next/router";
import type { GetServerSideProps } from "next";
import config from "../lib/config.js";
import { GalleryFor } from "../components/gallery";
import { SectionFolders } from "../components/nav/section-folders";
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
	const selectedSectionValue = activeSectionId >= 0 ? String(activeSectionId) : "";

	const handleSectionChange = (event: ChangeEvent<HTMLSelectElement>) => {
		const nextSection = event.target.value;
		if (!nextSection) {
			void router.push("/");
			return;
		}

		void router.push({
			pathname: "/",
			query: {
				section: nextSection,
			},
		});
	};

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
				<main className="mx-auto flex min-h-screen w-full max-w-[1800px] flex-col gap-5 px-4 py-5 lg:px-6 xl:px-8">
					<header className="rounded-[1.75rem] border border-white/10 bg-white/5 px-5 py-4 shadow-2xl shadow-sky-950/20 backdrop-blur-xl">
						<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
							<div className="max-w-2xl space-y-2">
								<div className="inline-flex items-center rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-sky-200">
									Travel Photo Album
								</div>
								<h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
									Browse your travel archive in one place.
								</h1>
								<p className="text-sm leading-6 text-slate-300">
									Switch trips from the header, expand the folder tree, and scan each day side by side with the gallery.
								</p>
							</div>
							<div className="grid gap-3 md:grid-cols-[minmax(260px,320px),minmax(220px,1fr)]">
								<label className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3">
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
								<div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3">
									<div className="text-xs uppercase tracking-[0.2em] text-slate-400">
										Current path
									</div>
									<div className="mt-2 truncate text-sm font-medium text-slate-200 sm:text-base">
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
