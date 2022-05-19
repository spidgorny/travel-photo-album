import fs from "fs";
import path from "path";
import crypto from "crypto";

export class ThumbQueue {

	queueRoot = './queue';

	constructor(props) {
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

}
