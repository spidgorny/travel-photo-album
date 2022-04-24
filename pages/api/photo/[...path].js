import fs from 'fs';
import mime from "mime-types";

export default async function handler(req, res) {
	try {
		const path = '//' + req.query.path.join('/');
		console.log(path);
		if (path.toLowerCase().endsWith('mp4')) {
			throw new Error('MP4 preview');
		}
		// const bytes = fs.readFileSync(path);
		const mimeType = mime.lookup(path);
		console.log(mimeType);
		res.setHeader('Content-Type', mimeType);
		res.setHeader('Cache-Control', 's-maxage=86400, public');
		const stream = fs.createReadStream(path);
		res.status(200);
		stream.pipe(res);
	} catch (e) {
		res.status(500).json({status: 'error', message: e.message, stack: e.stack});
	}
}
