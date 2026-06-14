import React from 'react';
import { HomePageProps } from '../../types/ui-vendor';

interface HomePageProps {
	searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

const HomePage: React.FC<HomePageProps> = ({ searchParams }) => {
	return (
		<main>
			<h1>Welcome to the Home Page</h1>
			{searchParams && <p>Loading...</p>}
		</main>
	);
};

export default HomePage;
