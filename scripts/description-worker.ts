// @ts-nocheck
import "../lib/load-env.ts";
import process from "process";
import { Queue, Worker } from "bullmq";
import { closeRedisClient } from "../lib/cache.ts";
import {
	createDescriptionQueueConnection,
} from "../lib/description-queue.ts";
import {
	descriptionJobActions,
	descriptionQueueName,
	descriptionQueuePrefix,
} from "../lib/description-jobs.ts";
import {
	getDescriptionWorkerLockDurationMs,
	processDescriptionJob,
	resolveDescriptionJobName,
} from "../lib/description-worker.ts";
import { closeThumbKvClient } from "../lib/thumb-store.ts";

const connection = createDescriptionQueueConnection();
if (!connection) {
	throw new Error("Description queue is not configured");
}

const queue = new Queue(descriptionQueueName, {
	connection,
	prefix: descriptionQueuePrefix,
});
const workerStartedAt = Date.now();
let processedThisRun = 0;
let totalObserved = 0;
const concurrency = getDescriptionWorkerConcurrency();
const activeDescriptionStartedAt = new Map();

const worker = new Worker(
	descriptionQueueName,
	async (job) => processDescriptionJob(job.name, job.data),
	{
		connection,
		concurrency,
		lockDuration: getDescriptionWorkerLockDurationMs(),
		lockRenewTime: Math.max(Math.floor(getDescriptionWorkerLockDurationMs() / 3), 15_000),
		prefix: descriptionQueuePrefix,
	},
);

function formatJobFilePath(filePath) {
	if (Array.isArray(filePath)) {
		return filePath.filter(Boolean).join("/");
	}
	if (typeof filePath === "string" && filePath.trim().length > 0) {
		return filePath.trim();
	}
	return "unknown-file";
}

function summarizeDescription(description) {
	if (typeof description !== "string") {
		return "";
	}
	return description.replace(/\s+/g, " ").trim();
}

function formatElapsed(elapsedMilliseconds) {
	if (!Number.isFinite(elapsedMilliseconds) || elapsedMilliseconds < 0) {
		return "--";
	}
	if (elapsedMilliseconds < 1000) {
		return `${Math.round(elapsedMilliseconds)}ms`;
	}
	return `${(elapsedMilliseconds / 1000).toFixed(1)}s`;
}

function getDescriptionWorkerConcurrency() {
	const parsedConcurrency = Number(process.env.DESCRIPTION_WORKER_CONCURRENCY ?? 1);
	return Number.isInteger(parsedConcurrency) && parsedConcurrency > 0 ? parsedConcurrency : 1;
}

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

worker.on("ready", () => {
	console.log(
		`Description worker ready on queue ${descriptionQueuePrefix}:${descriptionQueueName} (concurrency ${concurrency})`,
	);
	void logQueueDepth().catch((error) => {
		console.error(`queue depth failed ${error.message}`);
	});
});

worker.on("active", (job) => {
	const jobName = resolveDescriptionJobName(job.name, job.data);
	if (jobName === descriptionJobActions.generateImageDescription) {
		activeDescriptionStartedAt.set(job.id ?? job.name, Date.now());
		console.log(`describing ${formatJobFilePath(job.data?.filePath)}`);
	}
});

worker.on("completed", (job, result) => {
	const startedAt = activeDescriptionStartedAt.get(job.id ?? job.name);
	activeDescriptionStartedAt.delete(job.id ?? job.name);
	const elapsedSuffix = startedAt ? ` (${formatElapsed(Date.now() - startedAt)})` : "";
	const filePath = formatJobFilePath(result?.filePath ?? job?.data?.filePath);
	const description = summarizeDescription(result?.description);
	if (description) {
		console.log(`described ${filePath}${elapsedSuffix} :: ${description}`);
	} else {
		const suffix = result?.reason ? ` (${result.reason})` : "";
		console.log(`described ${filePath}${elapsedSuffix}${suffix}`);
	}
	processedThisRun += 1;
	void logQueueDepth().catch((error) => {
		console.error(`queue depth failed ${error.message}`);
	});
});

worker.on("failed", (job, error) => {
	const jobName = job ? resolveDescriptionJobName(job.name, job.data) : "unknown";
	activeDescriptionStartedAt.delete(job?.id ?? job?.name ?? "unknown");
	console.error(`failed ${job?.id ?? "unknown"} ${jobName} ${error.message}`);
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
	console.log(`shutting down description worker after ${signal}`);
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
