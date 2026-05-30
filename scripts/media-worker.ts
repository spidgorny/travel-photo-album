// @ts-nocheck
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

const worker = new Worker(
mediaQueueName,
async (job) => {
const jobName = resolveMediaJobName(job.name, job.data);
console.log(`starting ${job.id} ${jobName}`);
const result = await processMediaJob(job.name, job.data);
console.log(`completed ${job.id} ${jobName}`);
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
"prioritized",
"failed",
);
const pending =
(counts.waiting ?? 0) +
(counts.active ?? 0) +
(counts.delayed ?? 0) +
(counts.prioritized ?? 0);
const jobName = job ? resolveMediaJobName(job.name, job.data) : "unknown";
console.log(
`${context} ${job?.id ?? "unknown"} ${jobName} queue pending=${pending} waiting=${counts.waiting ?? 0} active=${counts.active ?? 0} delayed=${counts.delayed ?? 0} prioritized=${counts.prioritized ?? 0} failed=${counts.failed ?? 0}`,
);
}

worker.on("ready", () => {
console.log(
`BullMQ worker ready on queue ${mediaQueuePrefix}:${mediaQueueName} (concurrency ${getWorkerConcurrency()})`,
);
});

worker.on("completed", (job) => {
void logQueueDepth("queue", job).catch((error) => {
console.error(`queue depth failed ${error.message}`);
});
});

worker.on("failed", (job, error) => {
const jobName = job ? resolveMediaJobName(job.name, job.data) : "unknown";
console.error(`failed ${job?.id ?? "unknown"} ${jobName} ${error.message}`);
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
