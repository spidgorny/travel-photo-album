import { getThumbQueue } from "./thumb-queue";
import {
	thumbQueueName,
	thumbQueuePrefix,
	thumbQueueUrl,
} from "./thumb-jobs";

export async function getQueueInfo() {
	const queue = await getThumbQueue();
	if (!queue) {
		return {
			configured: false,
			connectionUrl: thumbQueueUrl || null,
			name: thumbQueueName,
			prefix: thumbQueuePrefix,
			counts: emptyQueueCounts(),
			totalQueued: 0,
			totalProcessed: 0,
		};
	}

	const counts = await queue.getJobCounts(
		"waiting",
		"active",
		"delayed",
		"completed",
		"failed",
		"paused",
	);

	return {
		configured: true,
		connectionUrl: thumbQueueUrl || null,
		name: thumbQueueName,
		prefix: thumbQueuePrefix,
		counts,
		totalQueued:
			(counts.waiting ?? 0) +
			(counts.active ?? 0) +
			(counts.delayed ?? 0) +
			(counts.paused ?? 0),
		totalProcessed: (counts.completed ?? 0) + (counts.failed ?? 0),
	};
}

function emptyQueueCounts() {
	return {
		waiting: 0,
		active: 0,
		delayed: 0,
		completed: 0,
		failed: 0,
		paused: 0,
	};
}
