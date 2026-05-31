import type { Metadata } from "next";
import config from "../../lib/config";
import { getQueueInfo } from "../../lib/queue-info";
import type { QueueProgressResponse, UISection } from "../_components/ui-types";
import { QueueDashboard } from "./queue-dashboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
	title: "Queue details | Travel Photo Album",
	description: "Inspect media and description queue health, backlog, and processing totals.",
};

export default async function QueueDetailsPage() {
	const sections = (Array.isArray(config?.sections) ? config.sections : []).map(
		(section, index) => ({
			...section,
			id: index,
		}),
	) as UISection[];
	const queue = await getQueueInfo();
	const initialData: QueueProgressResponse = {
		queue,
		updatedAt: new Date().toISOString(),
	};

	return <QueueDashboard sections={sections} initialData={initialData} />;
}
