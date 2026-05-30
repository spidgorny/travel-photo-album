import type { Metadata } from "next";
import "../styles/globals.css";

export const metadata: Metadata = {
	title: "Travel Photo Album",
	description: "Browse your travel photos by destination, folder, and day.",
};

interface RootLayoutProps {
	children: React.ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
	return (
		<html lang="en">
			<body>{children}</body>
		</html>
	);
}
