import formidable from "formidable";

function log(...vars) {
	console.log(process.uptime().toFixed(2), ...vars);
}

export async function parseMultipart(req) {
	return new Promise((resolve, reject) => {
		const form = formidable({ multiples: true }); // multiples means req.files will be an array
		form.parse(req, (err, fields, files) => {
			if (err) {
				reject(err);
			}

			resolve({ body: fields, files });
		});
	});
}

export async function detectAndParseMultipart(req) {
	const contentType = req?.headers["content-type"];
	log(contentType);
	if (contentType && contentType.includes("multipart/form-data")) {
		req = { ...req, ...(await parseMultipart(req)) };
	} else {
		// req.body = JSON.parse(req.body);
	}
	return req;
}
