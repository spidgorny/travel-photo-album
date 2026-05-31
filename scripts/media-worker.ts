// @ts-nocheck
import "../lib/load-env.ts";
import process from "process";
import { Queue, Worker } from "bullmq";
import { closeRedisClient } from "../lib/cache.ts";
import {
	getMediaQueueConnection,
	getWorkerConcurrency,
	mediaQueueName,
	mediaQueuePrefix,
	processMediaJob,
	resolveMediaJobName,
} from "../lib/media-worker.ts";
import { closeThumbKvClient } from "../lib/thumb-store.ts";

const queue = new Queue(mediaQueueName, {
	connection: getMediaQueueConnection(),
	prefix: mediaQueuePrefix,
});
const workerStartedAt = Date.now();
let processedThisRun = 0;
let totalObserved = 0;

const worker = new Worker(
	mediaQueueName,
	async (job) => processMediaJob(job.name, job.data),
	{
		connection: getMediaQueueConnection(),
		concurrency: getWorkerConcurrency(),
		prefix: mediaQueuePrefix,
	},
);

async function logQueueDepth() {
	const counts = await queue.getJobCounts("waiting", "active", "delayed");
	const active = counts.active ?? 0;
	const queued = (counts.waiting ?? 0) + (counts.delayed ?? 0);
	const currentTotal = processedThisRun + active + queued;
	totalObserved = Math.max(totalObserved, currentTotal);
	const percentComplete =
		totalObserved > 0 ? `${((processedThisRun / totalObserved) * 100).toFixed(1)}%` : "0.0%";
	const remaining = Math.max(totalObserved - processedThisRun, 0);
	const elapsedSeconds = Math.max((Date.now() - workerStartedAt) / 1000, 1);
	const throughputPerSecond = processedThisRun / elapsedSeconds;
	const eta =
		throughputPerSecond > 0 ? `ETA ${formatEta(remaining / throughputPerSecond)}` : "ETA --";
	console.log(
		`${percentComplete} total=${totalObserved} processed/active/queued=${processedThisRun}/${active}/${queued} ${eta}`,
	);
}

function formatEta(totalSeconds) {
	if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
		return "--";
	}
	const rounded = Math.ceil(totalSeconds);
	const hours = Math.floor(rounded / 3600);
	const minutes = Math.floor((rounded % 3600) / 60);
	const seconds = rounded % 60;
	if (hours > 0) {
		return `${hours}h${minutes.toString().padStart(2, "0")}m`;
	}
	if (minutes > 0) {
		return `${minutes}m${seconds.toString().padStart(2, "0")}s`;
	}
	return `${seconds}s`;
}

function formatJobFilePath(filePath) {
	if (Array.isArray(filePath)) {
		return filePath.join("/") || "unknown";
	}
	return typeof filePath === "string" && filePath.length > 0 ? filePath : "unknown";
}

worker.on("ready", () => {
	console.log(
		`BullMQ worker ready on queue ${mediaQueuePrefix}:${mediaQueueName} (concurrency ${getWorkerConcurrency()})`,
	);
	void logQueueDepth().catch((error) => {
		console.error(`queue depth failed ${error.message}`);
	});
});

worker.on("completed", (job, result) => {
	const filePath = formatJobFilePath(result?.filePath || job?.data?.filePath);
	console.log(`completed ${job?.id ?? "unknown"} ${filePath}`);
	processedThisRun += 1;
	void logQueueDepth().catch((error) => {
		console.error(`queue depth failed ${error.message}`);
	});
});

worker.on("failed", (job, error) => {
	const jobName = job ? resolveMediaJobName(job.name, job.data) : "unknown";
	const filePath = formatJobFilePath(job?.data?.filePath);
	console.error(`failed ${job?.id ?? "unknown"} ${jobName} ${filePath} ${error.message}`);
	processedThisRun += 1;
	void logQueueDepth().catch((queueError) => {
		console.error(`queue depth failed ${queueError.message}`);
	});
});

worker.on("error", (error) => {
	console.error(`worker error ${error.message}`);
});

let shuttingDown = false;

async function shutdown(signal, exitCode = 0) {
	if (shuttingDown) {
		return;
	}
	shuttingDown = true;
	console.log(`shutting down worker after ${signal}`);
	await worker.close().catch((error) => {
		console.error(`worker close failed ${error.message}`);
		exitCode = 1;
	});
	await queue.close().catch((error) => {
		console.error(`queue close failed ${error.message}`);
		exitCode = 1;
	});
	await Promise.allSettled([closeThumbKvClient(), closeRedisClient()]);
	process.exit(exitCode);
}

process.on("SIGINT", () => {
	void shutdown("SIGINT");
});
process.on("SIGTERM", () => {
	void shutdown("SIGTERM");
});
process.on("uncaughtException", (error) => {
	console.error(error);
	void shutdown("uncaughtException", 1);
});
process.on("unhandledRejection", (error) => {
	console.error(error);
	void shutdown("unhandledRejection", 1);
});

await worker.waitUntilReady();
await new Promise(() => {});
