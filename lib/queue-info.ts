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

type QueueDurationHistogramBucket = {
	startMs: number;
	endMs: number;
	count: number;
	includesLowerTail?: boolean;
	includesUpperTail?: boolean;
};

type QueueTimingStats = {
	averageSuccessfulJobTimeMs: number | null;
	sampledSuccessfulJobs: number;
	durationHistogram: QueueDurationHistogramBucket[];
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
			durationHistogram: [],
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
					durationHistogram: [],
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
	const successfulDurations: number[] = [];

	for (const job of completedJobs) {
		if (!job) {
			continue;
		}
		if (
			typeof job.processedOn !== "number" ||
			typeof job.finishedOn !== "number" ||
			job.finishedOn < job.processedOn
		) {
			continue;
		}

		const durationMs = job.finishedOn - job.processedOn;
		totalDurationMs += durationMs;
		sampledSuccessfulJobs += 1;
		successfulDurations.push(durationMs);
	}

	return {
		averageSuccessfulJobTimeMs:
			sampledSuccessfulJobs > 0 ? totalDurationMs / sampledSuccessfulJobs : null,
		sampledSuccessfulJobs,
		durationHistogram: buildDurationHistogram(successfulDurations),
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
		durationHistogram: [],
	};
}

function buildDurationHistogram(
	durationsMs: number[],
	targetBucketCount = 18,
): QueueDurationHistogramBucket[] {
	if (durationsMs.length === 0) {
		return [];
	}

	const sortedDurations = [...durationsMs].sort((left, right) => left - right);
	if (targetBucketCount <= 2) {
		return buildTailOnlyHistogram(sortedDurations, targetBucketCount);
	}

	const lowerTypicalDurationMs = getPercentile(sortedDurations, 0.1);
	const upperTypicalDurationMs = getPercentile(sortedDurations, 0.9);
	const typicalRangeMs = Math.max(
		upperTypicalDurationMs - lowerTypicalDurationMs,
		Math.max(getPercentile(sortedDurations, 0.5) * 0.35, 250),
	);
	const innerBucketCount = targetBucketCount - 2;
	const bucketSizeMs = chooseHistogramBucketSize(typicalRangeMs / innerBucketCount);
	const startMs = Math.max(0, Math.floor(lowerTypicalDurationMs / bucketSizeMs) * bucketSizeMs);
	const endMs = Math.max(startMs + bucketSizeMs, startMs + innerBucketCount * bucketSizeMs);
	const counts = Array.from({ length: targetBucketCount }, () => 0);
	let includesLowerTail = false;
	let includesUpperTail = false;

	for (const durationMs of sortedDurations) {
		if (durationMs < startMs) {
			counts[0] += 1;
			includesLowerTail = true;
			continue;
		}
		if (durationMs >= endMs) {
			counts[targetBucketCount - 1] += 1;
			includesUpperTail = true;
			continue;
		}
		const index = Math.min(
			targetBucketCount - 2,
			1 + Math.floor((durationMs - startMs) / bucketSizeMs),
		);
		counts[index] += 1;
	}

	return counts.map((count, index) => {
		if (index === 0) {
			return {
				startMs: 0,
				endMs: startMs,
				count,
				includesLowerTail,
				includesUpperTail: false,
			};
		}
		if (index === targetBucketCount - 1) {
			return {
				startMs: endMs,
				endMs: endMs + bucketSizeMs,
				count,
				includesLowerTail: false,
				includesUpperTail,
			};
		}
		const innerIndex = index - 1;
		return {
			startMs: startMs + innerIndex * bucketSizeMs,
			endMs: startMs + (innerIndex + 1) * bucketSizeMs,
			count,
			includesLowerTail: false,
			includesUpperTail: false,
		};
	});
}

function buildTailOnlyHistogram(
	sortedDurations: number[],
	targetBucketCount: number,
): QueueDurationHistogramBucket[] {
	const minDurationMs = sortedDurations[0] ?? 0;
	const maxDurationMs = sortedDurations[sortedDurations.length - 1] ?? minDurationMs;
	const bucketSizeMs = chooseHistogramBucketSize(
		Math.max(maxDurationMs - minDurationMs, 1) / Math.max(targetBucketCount, 1),
	);
	const startMs = Math.max(0, Math.floor(minDurationMs / bucketSizeMs) * bucketSizeMs);
	const counts = Array.from({ length: targetBucketCount }, () => 0);

	for (const durationMs of sortedDurations) {
		const index = Math.min(
			targetBucketCount - 1,
			Math.max(0, Math.floor((durationMs - startMs) / bucketSizeMs)),
		);
		counts[index] += 1;
	}

	return counts.map((count, index) => ({
		startMs: startMs + index * bucketSizeMs,
		endMs: startMs + (index + 1) * bucketSizeMs,
		count,
	}));
}

function getPercentile(sortedDurations: number[], percentile: number) {
	if (sortedDurations.length === 0) {
		return 0;
	}

	const clampedPercentile = Math.min(Math.max(percentile, 0), 1);
	const position = (sortedDurations.length - 1) * clampedPercentile;
	const lowerIndex = Math.floor(position);
	const upperIndex = Math.ceil(position);
	const lowerValue = sortedDurations[lowerIndex] ?? 0;
	const upperValue = sortedDurations[upperIndex] ?? lowerValue;
	if (lowerIndex === upperIndex) {
		return lowerValue;
	}
	const fraction = position - lowerIndex;
	return lowerValue + (upperValue - lowerValue) * fraction;
}

function chooseHistogramBucketSize(rawBucketSizeMs: number) {
	if (!Number.isFinite(rawBucketSizeMs) || rawBucketSizeMs <= 1) {
		return 1;
	}

	const magnitude = 10 ** Math.floor(Math.log10(rawBucketSizeMs));
	const normalized = rawBucketSizeMs / magnitude;

	if (normalized <= 1) {
		return magnitude;
	}
	if (normalized <= 2) {
		return 2 * magnitude;
	}
	if (normalized <= 2.5) {
		return 2.5 * magnitude;
	}
	if (normalized <= 5) {
		return 5 * magnitude;
	}
	return 10 * magnitude;
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
