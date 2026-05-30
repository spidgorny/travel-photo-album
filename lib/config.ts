import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

export interface RawConfigSection {
	name: string;
	from?: string;
	till?: string;
	linuxPath?: string;
	macPath?: string;
	path?: string;
	pathWindows?: string;
	thumbPath?: string;
	winPath?: string;
	[key: string]: unknown;
}

export interface ConfigSection extends RawConfigSection {
	path?: string;
}

export interface AppConfig {
	sections: ConfigSection[];
	[key: string]: unknown;
}

export const LAMBDA_ONWATER_URL =
	"https://1rphvpobz5.execute-api.us-east-1.amazonaws.com/on-water/"; // ADD wh
export const LAMBDA_ONWATER_TOKEN = "UYos5aRUb_4";
/**
 * @typedef SkuQty
 * @property sku {string}
 * @property quantity {number}
 */

export const lambdaBase = "https://pp6f5o6sy1.execute-api.us-east-2.amazonaws.com";

const platformPathKey: Partial<Record<NodeJS.Platform, keyof RawConfigSection>> = {
	darwin: "macPath",
	linux: "linuxPath",
	win32: "winPath",
};

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(moduleDir, "..", "config.json");
const rawConfig = JSON.parse(fs.readFileSync(configPath, "utf8")) as AppConfig;

export function resolveSection(section: RawConfigSection): ConfigSection {
	const pathKey = platformPathKey[process.platform];
	const resolvedPath = (
		(pathKey ? section[pathKey] : undefined) ??
		(pathKey === "winPath" ? section?.pathWindows : undefined) ??
		section?.path ??
		section?.macPath ??
		section?.linuxPath ??
		section?.winPath ??
		section?.pathWindows
	) as string | undefined;

	return {
		...section,
		path: typeof resolvedPath === "string" ? resolvedPath : undefined,
	};
}

const rawSections = Array.isArray(rawConfig?.sections) ? rawConfig.sections : [];

const config: AppConfig = {
	...(rawConfig ?? {}),
	sections: rawSections.map((section) => resolveSection(section as RawConfigSection)),
};

export default config;
