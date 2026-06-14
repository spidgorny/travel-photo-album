import config from "../../lib/config/config";
import { searchPhotoLibrary } from "../../lib/search/search";
import { AppHeader } from "../_components/app-header";
import { SearchResultPreviewGrid } from "../_components/search-result-preview-grid";
import {
	buildHomeDayHref,
	createGoogleMapsHref,
} from "../_components/url-paths";
import { firstQueryValue, type UISection } from "../_components/ui-types";

interface SearchPageProps {
	searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
	const resolvedSearchParams = (await searchParams) ?? {};
	const sections = (Array.isArray(config?.sections) ? config.sections : []).map(
		(section, index) => ({
			...section,
			id: index,
		}),
	) as UISection[];
	const rawQuery = firstQueryValue(resolvedSearchParams.q)?.trim() ?? "";
	const results = rawQuery ? await searchPhotoLibrary(sections, rawQuery) : [];
	const resultCount = results.length;
	const headerContext = rawQuery
		? `${resultCount} matching day${resultCount === 1 ? "" : "s"} for “${rawQuery}”`
		: 		"Search every collection by description, city, or person";

	return (
		<div className="relative overflow-hidden">
			<div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(circle_at_top,_rgba(125,211,252,0.18),_transparent_55%)]" />
			<main className="mx-auto flex min-h-screen w-full max-w-[1800px] flex-col gap-5 px-4 py-5 lg:px-6 xl:px-8">
				<AppHeader
					sections={sections}
					contextLabel="Search results"
					contextValue={headerContext}
					initialSearchQuery={rawQuery}
				/>
				<section className="min-w-0 rounded-[1.75rem] border border-white/10 bg-slate-950/45 p-4 shadow-xl shadow-black/20 backdrop-blur sm:p-5">
					{rawQuery ? (
						results.length ? (
							<div className="space-y-4">
								<div className="border-b border-white/10 pb-4">
									<h2 className="text-2xl font-semibold text-white">Search results</h2>
									<p className="mt-2 text-sm text-slate-400">
										Matching days are grouped by folder and date. Each card shows up to
										four photos before you jump into the full day view.
									</p>
								</div>
								<div className="space-y-4">
									{results.map((result) => (
										<article
											key={`${result.sectionId}:${result.folder}:${result.date}`}
											className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4 shadow-xl shadow-black/20"
										>
											<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
												<div className="space-y-3">
													<div className="flex flex-wrap items-center gap-2">
														<span className="rounded-full border border-sky-300/20 bg-sky-300/10 px-2.5 py-1 text-xs font-medium text-sky-100">
															{result.sectionName}
														</span>
														<span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-medium text-slate-300">
															{result.date}
														</span>
														<span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-medium text-slate-300">
															{result.count} photo{result.count === 1 ? "" : "s"}
														</span>
													</div>
													<div>
														<h3 className="text-lg font-semibold text-white">
															{result.folder ? result.folder.split("/").join(" / ") : "Collection root"}
														</h3>
														<p className="mt-1 text-sm text-slate-400">
															{result.matchingFileCount} matching photo
															{result.matchingFileCount === 1 ? "" : "s"} on this day
														</p>
													</div>
													{result.locations.length ? (
														<div className="flex flex-wrap gap-2">
															{result.locations.map((location) => (
																<a
																	key={`${result.sectionId}:${result.folder}:${result.date}:${location}`}
																	href={createGoogleMapsHref(location)}
																	target="_blank"
																	rel="noreferrer"
																	className="rounded-full border border-sky-300/20 bg-sky-300/10 px-2.5 py-1 text-xs font-medium text-sky-100 transition hover:border-sky-200/40 hover:bg-sky-300/20 hover:text-white"
																>
																	{location}
																</a>
															))}
														</div>
													) : null}
												</div>
												<a
													href={buildHomeDayHref(result.sectionName, result.folder, result.date)}
													className="inline-flex items-center justify-center rounded-full border border-sky-300/30 bg-sky-300/10 px-4 py-2 text-sm font-medium text-sky-100 transition hover:border-sky-200/40 hover:bg-sky-300/20 hover:text-white"
												>
													Open folder and day
												</a>
											</div>
											<SearchResultPreviewGrid
												sectionName={result.sectionName}
												previewFiles={result.previewFiles}
											/>
										</article>
									))}
								</div>
							</div>
						) : (
							<SearchEmptyState message={`No days matched “${rawQuery}”.`} />
						)
					) : (
						<SearchEmptyState message=						"Enter a description, city, or person name in the header to search across your travel collections." />
					)}
				</section>
			</main>
		</div>
	);
}

function SearchEmptyState({ message }: { message: string }) {
	return (
		<div className="flex min-h-[20rem] flex-col items-center justify-center rounded-[1.5rem] border border-dashed border-white/10 bg-slate-900/40 px-6 text-center">
			<div className="max-w-xl space-y-3">
				<h2 className="text-2xl font-semibold text-white">Search your archive</h2>
				<p className="text-sm leading-6 text-slate-400">{message}</p>
			</div>
		</div>
	);
}
