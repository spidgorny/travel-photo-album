import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(moduleDir, "..", "config.json");
const rawConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));

export const LAMBDA_ONWATER_URL =
	"https://1rphvpobz5.execute-api.us-east-1.amazonaws.com/on-water/"; // ADD wh
export const LAMBDA_ONWATER_TOKEN = "UYos5aRUb_4";
/**
 * @typedef SkuQty
 * @property sku {string}
 * @property quantity {number}
 */

export const lambdaBase = "https://pp6f5o6sy1.execute-api.us-east-2.amazonaws.com";

const platformPathKey = {
	darwin: "macPath",
	linux: "linuxPath",
	win32: "winPath",
};

export function resolveSection(section) {
	const pathKey = platformPathKey[process.platform];
	const resolvedPath =
		section?.[pathKey] ??
		(pathKey === "winPath" ? section?.pathWindows : undefined) ??
		section?.path ??
		section?.macPath ??
		section?.linuxPath ??
		section?.winPath ??
		section?.pathWindows;

	return {
		...section,
		path: resolvedPath,
	};
}

const rawSections = Array.isArray(rawConfig?.sections) ? rawConfig.sections : [];

const config = {
	...(rawConfig ?? {}),
	sections: rawSections.map(resolveSection),
};

export default config;
