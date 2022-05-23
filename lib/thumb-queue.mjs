import fs from "fs";
import path from "path";
import crypto from "crypto";

export class ThumbQueue {

	queueRoot = './queue';

	constructor({queueRoot} = {}) {
		if (queueRoot) {
			this.queueRoot = queueRoot;
		}
		fs.mkdirSync(this.queueRoot, {recursive: true});
	}

	async enqueue(data) {
		const hash = this.makeHash(data);
		const fileName = path.posix.join(this.queueRoot, hash + '.json');
		try {
			// fs.accessSync(fileName, fs.constants.W_OK);
			fs.writeFileSync(fileName, JSON.stringify(data, null, 2));
		} catch (e) {
			console.error(e.message);
		}
	}

	makeHash(data) {
		const shasum = crypto.createHash('sha1');
		return shasum.update(JSON.stringify(data)).digest('hex');
	}

	getJob() {
		this.readFiles();
		if (!this.files) {
			return null;
		}
		const jobHash = this.files[0];
		const jobData = JSON.parse(fs.readFileSync(path.posix.join(this.queueRoot, jobHash), 'utf8'));
		return {jobHash, ...jobData};
	}

	readFiles() {
		if (!this.files) {
			this.files = fs.readdirSync(this.queueRoot);
		}
	}

	removeJob(jobHash) {
		fs.unlinkSync(path.posix.join(this.queueRoot, jobHash));
		this.files = this.files.filter(x => x !== jobHash);
	}

	get length() {
		this.readFiles();
		return this.files.length;
	}

}
