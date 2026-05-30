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
async (job) => {
const result = await processMediaJob(job.name, job.data);
return result;
},
{
connection: getMediaQueueConnection(),
concurrency: getWorkerConcurrency(),
prefix: mediaQueuePrefix,
},
);

async function logQueueDepth(context, job) {
const counts = await queue.getJobCounts(
"waiting",
"active",
"delayed",
);
const active = counts.active ?? 0;
const queued = (counts.waiting ?? 0) + (counts.delayed ?? 0);
const processed = processedThisRun;
const currentTotal = processed + active + queued;
totalObserved = Math.max(totalObserved, currentTotal);
const percentComplete =
totalObserved > 0 ? `${((processed / totalObserved) * 100).toFixed(1)}%` : "0.0%";
const remaining = Math.max(totalObserved - processed, 0);
const elapsedSeconds = Math.max((Date.now() - workerStartedAt) / 1000, 1);
const throughputPerSecond = processed / elapsedSeconds;
const eta =
throughputPerSecond > 0 ? `ETA ${formatEta(remaining / throughputPerSecond)}` : "ETA --";
console.log(
`${context} ${percentComplete} total=${totalObserved} processed/active/queued=${processed}/${active}/${queued} ${eta}`,
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
`BullMQ worker ready on queue ${mediaQueuePrefix}:${mediaQueueName} (concurrency ${getWorkerConcurrency()})`,
);
void logQueueDepth("queue", null).catch((error) => {
	console.error(`queue depth failed ${error.message}`);
});
});

worker.on("completed", (job) => {
processedThisRun += 1;
void logQueueDepth("queue", job).catch((error) => {
console.error(`queue depth failed ${error.message}`);
});
});

worker.on("failed", (job, error) => {
const jobName = job ? resolveMediaJobName(job.name, job.data) : "unknown";
console.error(`failed ${job?.id ?? "unknown"} ${jobName} ${error.message}`);
processedThisRun += 1;
void logQueueDepth("queue", job).catch((queueError) => {
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
