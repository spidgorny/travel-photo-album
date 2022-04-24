import { renderToStaticMarkup } from "react-dom/server.js";
import pdf from "html-pdf";
import * as path from "path";

export const componentToHTML = (component) => {
	const html = renderToStaticMarkup(component);
	return html;
};

export const htmlToPDFBuffer = (html) => {
	return new Promise((resolve, reject) => {
		const options = {
			format: "A4",
			orientation: "portrait",
			border: "10mm",
			footer: {
				height: "10mm",
			},
			type: "pdf",
			timeout: 30000,
			phantomPath: path.resolve(
				process.cwd(),
				"node_modules/phantomjs-prebuilt/lib/phantom/bin/phantomjs"
			),
		};

		pdf.create(html, options).toBuffer((err, buffer) => {
			if (err) {
				return reject(err);
			}

			return resolve(buffer);
		});
	});
};
