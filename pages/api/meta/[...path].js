import fs from 'fs';
import mime from "mime-types";
import sizeOf from 'image-size';
import { promisify } from 'util';

export default async function handler(req, res) {
	try {
		const path = '//' + req.query.path.join('/');
		console.log(path);
		if (path.toLowerCase().endsWith('mp4')) {
			throw new Error('MP4 preview');
		}
		const mimeType = mime.lookup(path);
		console.log(mimeType);

		const sizeOfAsync = promisify(sizeOf)
		const dimensions = await sizeOfAsync(path);

		res.setHeader('Cache-Control', 's-maxage=86400, public');
		res.status(200).json({mimeType, dimensions});
	} catch (e) {
		res.status(500).json({status: 'error', message: e.message, stack: e.stack});
	}
}
