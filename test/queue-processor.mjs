import { runTest } from "./bootstrap.js";
import { ThumbQueue } from "../lib/thumb-queue.mjs";
import invariant from "tiny-invariant";
import { joinSectionPath } from "../lib/files.mjs";
import * as path from "path";
import * as fs from "fs";

runTest(async () => {
	const q = new ThumbQueue({queueRoot: '../queue'});
	// console.log(job);
	while (q.length) {
		const job = q.getJob();
		console.log(q.length, path.posix.join(job.section.path, job.filePath.join('/')));
		const actionMap = {
			'get-meta-for-file': getMetaForFile,
			'store-meta-for-video': storeMetaForVideo,
		};
		const code = actionMap[job.action];
		invariant(code, 'no handler for ' + job.action);
		await code(job);
		q.removeJob(job.jobHash);
	}
});

async function getMetaForFile(job) {
	const metaFile = getMetaFile(job);
	const metaData = getMeta(metaFile);
	// console.log(metaData);
	const baseName = path.basename(job.filePath.join('/'));
	metaData[baseName] = job.metaData;
	// console.log(metaData);

	fs.writeFileSync(metaFile, JSON.stringify(metaData, null, 2));
}

async function storeMetaForVideo(job) {
	const metaFile = getMetaFile(job);
	const metaData = getMeta(metaFile);
	// console.log(metaData);
	const baseName = path.basename(job.filePath.join('/'));
	const videoStream = job.data.streams.find(x => x.codec_type === 'video');
	const COMPUTED = {Width: videoStream.width, Height: videoStream.height};
	metaData[baseName] = {...job.data, COMPUTED};
	fs.writeFileSync(metaFile, JSON.stringify(metaData, null, 2));
}

function getMetaFile(job) {
	const metaDir = path.dirname(joinSectionPath(job.section.path, job.filePath));
	const metaFile = path.join(metaDir, 'meta.json');
	return metaFile;
}

function getMeta(metaFile) {
	let metaData = {};
	try {
		metaData = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
	} catch {
	}
	return metaData;
}
