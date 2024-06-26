import Head from "next/head";
import Image from "next/image";
import styles from "../styles/Home.module.css";
import "bootstrap/dist/css/bootstrap.min.css";
import { Container } from "react-bootstrap";
import config from "../config.json";
import { GalleryFor } from "../components/gallery.js";
import { useRouter } from "next/router";
import { SectionsNav } from "../components/nav/sections-nav";
import { SectionFolders } from "../components/nav/section-folders";

export default function Home({ sections }) {
	const router = useRouter();
	const sectionId = Number(router.query.section);
	const { folder } = router.query;

	return (
		<>
			<Head>
				<title>Travel Photo Album</title>
				<meta name="description" content="Generated by create next app" />
				<link rel="icon" href="/favicon.ico" />
			</Head>

			<div className="bg-dark text-light">
				<Container fluid className="d-flex">
					<div className="flex-grow-0" style={{ width: "25%" }}>
						<h4>Travel Photo Album</h4>
						<SectionsNav sections={sections} sectionId={sectionId} />
						<SectionFolders section={sections[sectionId]} />
					</div>
					<div className="flex-grow-1" style={{ width: "75%" }}>
						{sectionId >= 0 && (
							<GalleryFor
								sectionId={sectionId}
								section={sections[sectionId]}
								folder={folder}
							/>
						)}
					</div>
				</Container>

				<footer className={styles.footer}>
					<a
						href="https://vercel.com?utm_source=create-next-app&utm_medium=default-template&utm_campaign=create-next-app"
						target="_blank"
						rel="noopener noreferrer"
					>
						Powered by{" "}
						<span className={styles.logo}>
							<Image
								src="/vercel.svg"
								alt="Vercel Logo"
								width={72}
								height={16}
							/>
						</span>
					</a>
				</footer>
			</div>
		</>
	);
}

export function getServerSideProps() {
	return {
		props: {
			sections: config.sections.map((x, index) => ({ ...x, id: index })),
		},
	};
}
