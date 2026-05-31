"use client";

import { useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { InfoSidebar } from "./info-sidebar";
import { QueueProgressWidget } from "./queue-progress-widget";
import type { UISection } from "./ui-types";

interface AppHeaderProps {
	sections: UISection[];
	activeSectionId?: number;
	activeFolder?: string;
	contextLabel: string;
	contextValue: string;
	initialSearchQuery?: string;
}

export function AppHeader({
	sections,
	activeSectionId = -1,
	activeFolder = "",
	contextLabel,
	contextValue,
	initialSearchQuery = "",
}: AppHeaderProps) {
	const router = useRouter();
	const [isInfoOpen, setIsInfoOpen] = useState(false);
	const section = sections[activeSectionId];
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
		<>
			<InfoSidebar
				isOpen={isInfoOpen}
				onClose={() => setIsInfoOpen(false)}
				activeCollection={section?.name}
				activeFolder={activeFolder}
			/>
			<header className="rounded-[1.75rem] border border-white/10 bg-white/5 px-5 py-4 shadow-2xl shadow-sky-950/20 backdrop-blur-xl">
				<div className="flex flex-col gap-4">
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
								Switch trips from the header, search descriptions and cities, and
								jump straight into matching days.
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
									{contextLabel}
								</div>
								<div className="mt-2 truncate text-sm font-medium text-slate-200">
									{contextValue}
								</div>
							</div>
						</div>
					</div>
					<form
						action="/search"
						className="rounded-[1.5rem] border border-white/10 bg-slate-950/35 p-4"
					>
						<div className="flex flex-col gap-3 lg:flex-row lg:items-end">
							<label className="min-w-0 flex-1">
								<div className="text-xs uppercase tracking-[0.2em] text-slate-400">
									Global search
								</div>
								<input
									type="search"
									name="q"
									defaultValue={initialSearchQuery}
									placeholder="Search image descriptions or geocoded cities"
									className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900/90 px-4 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-sky-300/50"
								/>
							</label>
							<div className="flex items-center gap-2">
								<button
									type="submit"
									className="rounded-full border border-sky-300/30 bg-sky-300/10 px-4 py-2 text-sm font-medium text-sky-100 transition hover:border-sky-200/40 hover:bg-sky-300/20 hover:text-white"
								>
									Search
								</button>
								{initialSearchQuery ? (
									<a
										href="/search"
										className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-300 transition hover:border-white/20 hover:text-white"
									>
										Clear
									</a>
								) : null}
							</div>
						</div>
					</form>
				</div>
			</header>
		</>
	);
}
