import config from '../../config.json';
import readdir from "recursive-readdir";
import path from 'path';

export default async function handler(req, res) {
	try {
		const sectionId = Number(req.query.section);
		const section = config.sections[sectionId];
		let imagePath = section.path;
		if (process.platform === 'win32') {
			imagePath = imagePath.replace('/media/nas/photo/', '//192.168.1.189/photo/');
		}
		let files = await readdir(imagePath);
		if (section.from) {
			const iFrom = files.findIndex(x => path.basename(x) === section.from);
			console.log({iFrom});
			if (iFrom >= 0) {
				files = files.slice(iFrom);
			}
		}
		if (section.till) {
			const iTill = files.findIndex(x => path.basename(x) === section.till);
			console.log({iTill});
			if (iTill >= 0) {
				files = files.slice(0, iTill + 1);
			}
		}
		console.log({files});
		res.setHeader('Cache-Control', 's-maxage=6000');
		res.status(200).json({section, imagePath, files});
	} catch (e) {
		res.status(500).json({status: 'error', message: e.message, stack: e.stack});
	}
}
