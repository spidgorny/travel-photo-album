import crypto from "crypto";
import { Queue, type ConnectionOptions, type JobsOptions } from "bullmq";
import {
	descriptionQueueName,
	descriptionQueuePrefix,
	descriptionQueueUrl,
	type DescriptionJobData,
} from "./description-jobs.ts";

let descriptionQueue: Queue | null = null;
let descriptionQueueWarningWasShown = false;
const jobRetryDelayMs = 60 * 60 * 1000;

function warnDescriptionQueue(message: string, error: Error | null = null) {
	if (descriptionQueueWarningWasShown) {
		return;
	}
	descriptionQueueWarningWasShown = true;
	console.warn("description-queue", message, error?.message ?? "");
}

export function createDescriptionQueueConnection() {
	if (!descriptionQueueUrl) {
		return null;
	}
	const url = new URL(descriptionQueueUrl);
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

export async function getDescriptionQueue() {
	if (!descriptionQueueUrl) {
		warnDescriptionQueue(
			"queue disabled; set DESCRIPTION_QUEUE_URL, THUMB_QUEUE_URL, or BULLMQ_REDIS_URL",
		);
		return null;
	}
	const connection = createDescriptionQueueConnection();
	if (!connection) {
		return null;
	}
	if (!descriptionQueue) {
		descriptionQueue = new Queue(descriptionQueueName, {
			connection,
			prefix: descriptionQueuePrefix,
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
	return descriptionQueue;
}

export async function closeDescriptionQueue() {
	if (descriptionQueue) {
		await descriptionQueue.close().catch(() => {});
		descriptionQueue = null;
	}
}

export async function validateDescriptionQueueConnection() {
	const queue = await getDescriptionQueue();
	if (!queue) {
		throw new Error(
			"Description BullMQ queue is not configured; set DESCRIPTION_QUEUE_URL, THUMB_QUEUE_URL, or BULLMQ_REDIS_URL",
		);
	}
	await queue.waitUntilReady();
	await queue.getJobCounts("waiting");
	return queue;
}

export class DescriptionQueue {
	async enqueue(data: DescriptionJobData, options: JobsOptions = {}) {
		const queue = await getDescriptionQueue();
		if (!queue) {
			return null;
		}
		const hash = this.makeHash(data);
		return queue.add(data.action, data, {
			jobId: `description:${data.action}:${hash}`,
			...options,
		});
	}

	makeHash(data: DescriptionJobData) {
		const shasum = crypto.createHash("sha1");
		return shasum.update(JSON.stringify(data)).digest("hex");
	}
}
