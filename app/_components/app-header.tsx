import React from 'react';
import { UISection } from '../../types/ui-vendor';

interface AppHeaderProps {
	sections: UISection[];
	activeSectionId?: number;
	activeFolder?: string;
	contextLabel: string;
	contextValue: string;
	initialSearchQuery?: string;
}

const AppHeader: React.FC<AppHeaderProps> = ({ sections, activeSectionId, activeFolder, contextLabel, contextValue, initialSearchQuery }) => {
	return (
		<header>
			<h1>Hey</h1>
			<nav>
				{sections.map((section) => (
					<a key={section.id} href={`/${section.name}`}>
						{section.name}
					</a>
				))}
			</nav>
			<p>{`Current context: ${contextLabel}: ${contextValue}`}</p>
			{activeSectionId && <p>Active section: {sections.find((s) => s.id === activeSectionId)?.name ?? 'Unknown'}</p>}
			{activeFolder && <p>Active folder: {activeFolder}</p>}
			{initialSearchQuery && <p>Initial search query: {initialSearchQuery}</p>}
		</header>
	);
};

export default AppHeader;
