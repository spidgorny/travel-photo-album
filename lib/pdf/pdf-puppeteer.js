// import chromium from "chrome-aws-lambda";
import puppeteer from "puppeteer";

export async function html2pdf(html) {
	let browser;
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
	browser = await puppeteer.launch();
	// }

	let page = await browser.newPage();
	// await page.goto("https://google.com");
	await page.setContent(html);

	let pdfData = await page.pdf({ format: "a4" });
	return pdfData;
}
