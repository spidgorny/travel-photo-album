// @ts-nocheck
import "../lib/system/load-env.ts";
import process from "process";
import { Queue, Worker } from "bullmq";
import { closeRedisClient } from "../lib/system/cache.ts";
import {
	getMediaQueueConnection,
	getWorkerConcurrency,
	getWorkerLockDurationMs,
	mediaQueueName,
	mediaQueuePrefix,
	processMediaJob,
	resolveMediaJobName,
} from "../lib/media/media-worker.ts";
import { closeThumbKvClient } from "../lib/media/thumb-store.ts";

const queue = new Queue(mediaQueueName, {
	connection: getMediaQueueConnection(),
	prefix: mediaQueuePrefix,
});
const workerStartedAt = Date.now();
let processedThisRun = 0;
let totalObserved = 0;
const stepAverages = new Map();

const worker = new Worker(
	mediaQueueName,
	async (job) => processMediaJob(job.name, job.data),
	{
		connection: getMediaQueueConnection(),
		concurrency: getWorkerConcurrency(),
		lockDuration: getWorkerLockDurationMs(),
		lockRenewTime: Math.max(Math.floor(getWorkerLockDurationMs() / 3), 15_000),
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

function formatDuration(durationMs) {
	if (!Number.isFinite(durationMs) || durationMs < 0) {
		return "--";
	}
	if (durationMs < 1000) {
		return `${Math.round(durationMs)}ms`;
	}
	if (durationMs < 60_000) {
		return `${(durationMs / 1000).toFixed(durationMs < 10_000 ? 1 : 0)}s`;
	}
	return formatEta(durationMs / 1000);
}

function getStepMarker(step) {
	if (step?.status === "done") {
		return "[x]";
	}
	if (step?.status === "failed") {
		return "[!]";
	}
	return "[ ]";
}

function trackAverageDuration(step) {
	if (step?.status !== "done" || !Number.isFinite(step?.durationMs)) {
		return null;
	}
	const stats = stepAverages.get(step.label) ?? { totalMs: 0, count: 0 };
	stats.totalMs += step.durationMs;
	stats.count += 1;
	stepAverages.set(step.label, stats);
	return stats.totalMs / stats.count;
}

function logPipeline(result) {
	const steps = Array.isArray(result?.pipeline?.steps) ? result.pipeline.steps : [];
	if (!steps.length) {
		return;
	}

	const labelWidth = Math.max(
		4,
		...steps.map((step) => String(step?.label ?? "step").length),
	);
	console.log(`  step${" ".repeat(Math.max(labelWidth - 4, 0))}\tthis\tavg`);
	for (const step of steps) {
		const marker = getStepMarker(step);
		const durationText =
			step?.status === "done"
				? formatDuration(step.durationMs)
				: step?.status === "failed"
					? `${formatDuration(step.durationMs)} failed`
					: step?.detail || "skipped";
		const averageDuration = trackAverageDuration(step);
		const averageText = averageDuration == null ? "--" : formatDuration(averageDuration);
		const detailSuffix =
			step?.detail && step?.status === "done" ? `  ${step.detail}` : "";
		console.log(
			`  ${marker} ${String(step?.label ?? "step").padEnd(labelWidth)}\t${durationText}\t${averageText}${detailSuffix}`,
		);
	}
}

worker.on("ready", () => {
	console.log(
		`BullMQ worker ready on queue ${mediaQueuePrefix}:${mediaQueueName} (concurrency ${getWorkerConcurrency()}, lock ${formatDuration(getWorkerLockDurationMs())})`,
	);
	void logQueueDepth().catch((error) => {
		console.error(`queue depth failed ${error.message}`);
	});
});

worker.on("completed", (job, result) => {
	const filePath = formatJobFilePath(result?.filePath || job?.data?.filePath);
	console.log(`${filePath}`);
	logPipeline(result);
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
