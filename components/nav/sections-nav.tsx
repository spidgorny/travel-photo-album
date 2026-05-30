import Link from "next/link";
import type { UISection } from "../ui-types";

interface SectionsNavProps {
	sections?: UISection[];
	sectionId?: number;
}

export function SectionsNav({ sections = [], sectionId }: SectionsNavProps) {
	return (
		<ul>
			{sections.map((section, index) => (
				<li key={section.id ?? index} className={index === sectionId ? "active text-light" : ""}>
					<Link href={`?section=${index}`} className={index === sectionId ? "active text-light" : ""}>
						{section.name}
					</Link>
				</li>
			))}
		</ul>
	);
}
