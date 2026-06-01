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

type QueueTimingStats = {
	averageSuccessfulJobTimeMs: number | null;
	sampledSuccessfulJobs: number;
};

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
			averageSuccessfulJobTimeMs: null,
			sampledSuccessfulJobs: 0,
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
		...mergeQueueTimingStats(queueInfos),
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
					averageSuccessfulJobTimeMs: null,
					sampledSuccessfulJobs: 0,
			  }
			: null;
	}

	const [counts, timingStats] = await Promise.all([
		queue.getJobCounts(...queueCountTypes),
		getQueueTimingStats(queue),
	]);
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
		...timingStats,
	};
}

async function getQueueTimingStats(queue: Queue): Promise<QueueTimingStats> {
	const completedJobs = await queue.getJobs(["completed"], 0, 999, false);
	let totalDurationMs = 0;
	let sampledSuccessfulJobs = 0;

	for (const job of completedJobs) {
		if (
			typeof job.processedOn !== "number" ||
			typeof job.finishedOn !== "number" ||
			job.finishedOn < job.processedOn
		) {
			continue;
		}

		totalDurationMs += job.finishedOn - job.processedOn;
		sampledSuccessfulJobs += 1;
	}

	return {
		averageSuccessfulJobTimeMs:
			sampledSuccessfulJobs > 0 ? totalDurationMs / sampledSuccessfulJobs : null,
		sampledSuccessfulJobs,
	};
}

function mergeQueueTimingStats(
	queueInfos: Array<{
		averageSuccessfulJobTimeMs: number | null;
		sampledSuccessfulJobs: number;
	}>,
): QueueTimingStats {
	let totalDurationMs = 0;
	let sampledSuccessfulJobs = 0;

	for (const queueInfo of queueInfos) {
		if (
			queueInfo.averageSuccessfulJobTimeMs === null ||
			queueInfo.sampledSuccessfulJobs <= 0
		) {
			continue;
		}

		totalDurationMs +=
			queueInfo.averageSuccessfulJobTimeMs * queueInfo.sampledSuccessfulJobs;
		sampledSuccessfulJobs += queueInfo.sampledSuccessfulJobs;
	}

	return {
		averageSuccessfulJobTimeMs:
			sampledSuccessfulJobs > 0 ? totalDurationMs / sampledSuccessfulJobs : null,
		sampledSuccessfulJobs,
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
