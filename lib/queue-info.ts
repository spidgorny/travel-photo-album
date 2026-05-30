import type { Queue } from "bullmq";
import { getDescriptionQueue } from "./description-queue";
import {
	descriptionQueueName,
	descriptionQueuePrefix,
	descriptionQueueUrl,
} from "./description-jobs";
import { getThumbQueue } from "./thumb-queue";
import { thumbQueueName, thumbQueuePrefix, thumbQueueUrl } from "./thumb-jobs";

const queueCountTypes = [
	"waiting",
	"active",
	"delayed",
	"completed",
	"failed",
	"paused",
] as const;

type QueueCounts = Record<(typeof queueCountTypes)[number], number>;

export async function getQueueInfo() {
	const [thumbQueue, descriptionQueue] = await Promise.all([
		getThumbQueue(),
		getDescriptionQueue(),
	]);

	const queueInfos = (
		await Promise.all([
			getSingleQueueInfo({
				label: "media",
				queue: thumbQueue,
				connectionUrl: thumbQueueUrl || null,
				name: thumbQueueName,
				prefix: thumbQueuePrefix,
			}),
			getSingleQueueInfo({
				label: "description",
				queue: descriptionQueue,
				connectionUrl: descriptionQueueUrl || null,
				name: descriptionQueueName,
				prefix: descriptionQueuePrefix,
			}),
		])
	).filter((queueInfo): queueInfo is NonNullable<typeof queueInfo> => Boolean(queueInfo));

	if (queueInfos.length === 0) {
		return {
			configured: false,
			connectionUrl: thumbQueueUrl || descriptionQueueUrl || null,
			name: [thumbQueueName, descriptionQueueName].filter(Boolean).join(", "),
			prefix: [thumbQueuePrefix, descriptionQueuePrefix].filter(Boolean).join(", "),
			counts: emptyQueueCounts(),
			totalQueued: 0,
			totalProcessed: 0,
			queues: [],
		};
	}

	const counts = queueInfos.reduce<QueueCounts>((summary, queueInfo) => {
		for (const countType of queueCountTypes) {
			summary[countType] += queueInfo.counts[countType] ?? 0;
		}
		return summary;
	}, emptyQueueCounts());

	return {
		configured: true,
		connectionUrl:
			queueInfos.length === 1
				? queueInfos[0]?.connectionUrl ?? null
				: [thumbQueueUrl, descriptionQueueUrl].filter(Boolean).join(", "),
		name: queueInfos.map((queueInfo) => queueInfo.name).join(", "),
		prefix: queueInfos.map((queueInfo) => queueInfo.prefix).join(", "),
		counts,
		totalQueued:
			(counts.waiting ?? 0) +
			(counts.active ?? 0) +
			(counts.delayed ?? 0) +
			(counts.paused ?? 0),
		totalProcessed: (counts.completed ?? 0) + (counts.failed ?? 0),
		queues: queueInfos,
	};
}

async function getSingleQueueInfo({
	label,
	queue,
	connectionUrl,
	name,
	prefix,
}: {
	label: "media" | "description";
	queue: Queue | null;
	connectionUrl: string | null;
	name: string;
	prefix: string;
}) {
	if (!queue) {
		return connectionUrl
			? {
					label,
					configured: false,
					connectionUrl,
					name,
					prefix,
					counts: emptyQueueCounts(),
			  }
			: null;
	}

	const counts = await queue.getJobCounts(...queueCountTypes);
	return {
		label,
		configured: true,
		connectionUrl,
		name,
		prefix,
		counts: {
			waiting: counts.waiting ?? 0,
			active: counts.active ?? 0,
			delayed: counts.delayed ?? 0,
			completed: counts.completed ?? 0,
			failed: counts.failed ?? 0,
			paused: counts.paused ?? 0,
		},
	};
}

function emptyQueueCounts(): QueueCounts {
	return {
		waiting: 0,
		active: 0,
		delayed: 0,
		completed: 0,
		failed: 0,
		paused: 0,
	};
}
