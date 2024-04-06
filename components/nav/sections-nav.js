import Link from "next/link";

export function SectionsNav({ sections, sectionId }) {
	return (
		<ul>
			{sections.map((x, index) => (
				<li
					key={index}
					className={index === sectionId ? "active text-light" : ""}
				>
					<Link href={`?section=${index}`} className={index === sectionId ? "active text-light" : ""}>
							{x.name}
					</Link>
				</li>
			))}
		</ul>
	);
}
