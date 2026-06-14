// @ts-nocheck
import "../lib/system/load-env.ts";
import { runTest } from "./bootstrap.ts";
import { createMediaQueue, processMediaJob, resolveMediaJobName } from "../lib/media/media-worker.ts";

runTest(async () => {
	const queue = createMediaQueue();
	let processed = 0;

	while (true) {
		const jobs = await queue.getJobs(["waiting", "prioritized", "delayed"], 0, 24);
		if (!jobs.length) {
			break;
		}

		for (const job of jobs) {
			const jobName = resolveMediaJobName(job.name, job.data);
			console.log(`processing ${job.id} ${jobName}`);
			await processMediaJob(job.name, job.data);
			await job.remove();
			processed += 1;
		}
	}

	await queue.close();
	console.log(`processed ${processed} queued jobs`);
});
