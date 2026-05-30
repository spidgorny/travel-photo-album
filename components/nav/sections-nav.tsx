import Link from "next/link";
import type { UISection } from "../ui-types";

interface SectionsNavProps {
	sections?: UISection[];
	sectionId?: number;
}

export function SectionsNav({ sections = [], sectionId }: SectionsNavProps) {
	return (
		<ul className="space-y-2">
			{sections.map((section, index) => (
				<li key={section.id ?? index}>
					<Link
						href={`/?section=${index}`}
						className={[
							"group flex items-center justify-between rounded-2xl border px-4 py-3 transition",
							index === sectionId
								? "border-sky-400/40 bg-sky-400/15 text-white shadow-lg shadow-sky-950/30"
								: "border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/15 hover:bg-white/[0.06] hover:text-white",
						].join(" ")}
					>
						<div className="flex items-center gap-3">
							<span
								className={[
									"h-2.5 w-2.5 rounded-full transition",
									index === sectionId ? "bg-sky-300 shadow-[0_0_0_4px_rgba(125,211,252,0.12)]" : "bg-slate-500 group-hover:bg-slate-300",
								].join(" ")}
							/>
							<span className="font-medium">
								{section.name}
							</span>
						</div>
						<span className="text-xs uppercase tracking-[0.18em] text-slate-400 group-hover:text-slate-200">
							{String(index).padStart(2, "0")}
						</span>
					</Link>
				</li>
			))}
		</ul>
	);
}
