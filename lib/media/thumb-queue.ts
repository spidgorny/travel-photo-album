import crypto from "crypto";
import { Queue, type ConnectionOptions, type JobsOptions } from "bullmq";
import {
	thumbQueueName,
	thumbQueuePrefix,
	thumbQueueUrl,
	type ThumbJobData,
} from "../media/thumb-jobs.ts";

let thumbQueue: Queue | null = null;
let thumbQueueWarningWasShown = false;
const jobRetryDelayMs = 60 * 60 * 1000;

function warnThumbQueue(message: string, error: Error | null = null) {
	if (thumbQueueWarningWasShown) {
		return;
	}
	thumbQueueWarningWasShown = true;
	console.warn("thumb-queue", message, error?.message ?? "");
}

export function createThumbQueueConnection() {
	if (!thumbQueueUrl) {
		return null;
	}
	const url = new URL(thumbQueueUrl);
	const db = url.pathname.length > 1 ? Number(url.pathname.slice(1)) : undefined;
	const connection: ConnectionOptions = {
		host: url.hostname,
		port: url.port ? Number(url.port) : 6379,
		username: url.username || undefined,
		password: url.password || undefined,
		db: typeof db === "number" && !Number.isNaN(db) ? db : undefined,
		enableReadyCheck: false,
		maxRetriesPerRequest: null,
	};
	if (url.protocol === "rediss:") {
		connection.tls = {};
	}
	return connection;
}

export async function getThumbQueue() {
	if (!thumbQueueUrl) {
		warnThumbQueue("queue disabled; set THUMB_QUEUE_URL or BULLMQ_REDIS_URL");
		return null;
	}
	const connection = createThumbQueueConnection();
	if (!connection) {
		return null;
	}
	if (!thumbQueue) {
		thumbQueue = new Queue(thumbQueueName, {
			connection,
			prefix: thumbQueuePrefix,
			defaultJobOptions: {
				attempts: 3,
				backoff: {
					type: "fixed",
					delay: jobRetryDelayMs,
				},
				removeOnComplete: 1000,
				removeOnFail: 1000,
			},
		});
	}
	return thumbQueue;
}

export async function closeThumbQueue() {
	if (thumbQueue) {
		await thumbQueue.close().catch(() => {});
		thumbQueue = null;
	}
}

export async function validateBullMqConnection(
	queue: Queue,
	queueLabel = thumbQueueName,
) {
	try {
		await queue.waitUntilReady();
		await queue.getJobCounts("waiting");
		return queue;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`BullMQ connection failed for ${queueLabel}: ${message}`);
	}
}

export async function validateThumbQueueConnection() {
	const queue = await getThumbQueue();
	if (!queue) {
		throw new Error(
			"BullMQ queue is not configured; set THUMB_QUEUE_URL or BULLMQ_REDIS_URL",
		);
	}
	return validateBullMqConnection(queue, thumbQueueName);
}

export class ThumbQueue {
	async enqueue(data: ThumbJobData, options: JobsOptions = {}) {
		const queue = await getThumbQueue();
		if (!queue) {
			return null;
		}
		const hash = this.makeHash(data);
		return queue.add(data.action, data, {
			jobId: `thumb:${data.action}:${hash}`,
			...options,
		});
	}

	async enqueueBulk(dataItems: ThumbJobData[]) {
		if (!dataItems.length) return [];
		const queue = await getThumbQueue();
		if (!queue) return [];
		return queue.addBulk(
			dataItems.map((data) => ({
				name: data.action,
				data,
				opts: { jobId: `thumb:${data.action}:${this.makeHash(data)}` },
			})),
		);
	}

	makeHash(data: ThumbJobData) {
		const shasum = crypto.createHash("sha1");
		return shasum.update(JSON.stringify(data)).digest("hex");
	}
}
