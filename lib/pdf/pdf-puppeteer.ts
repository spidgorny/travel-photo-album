// @ts-nocheck
// import chromium from "chrome-aws-lambda";
import puppeteer from "puppeteer";

export async function html2pdf(html) {
	const browser = await puppeteer.launch();
	// console.log({ path: await chromium.executablePath });
	// if (await chromium.executablePath) {
	// 	browser = await chromium.puppeteer.launch({
	// 		args: chromium.args,
	// 		defaultViewport: chromium.defaultViewport,
	// 		executablePath: await chromium.executablePath,
	// 		headless: chromium.headless,
	// 		ignoreHTTPSErrors: true,
	// 	});
	// } else {
	// }

	const page = await browser.newPage();
	// await page.goto("https://google.com");
	await page.setContent(html);

	const pdfData = await page.pdf({ format: "a4" });
	return pdfData;
}
