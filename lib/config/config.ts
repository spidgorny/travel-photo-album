import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

export interface RawConfigSection {
	name: string;
	from?: string;
	till?: string;
	dockerPath?: string;
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

type SectionPathKey = "dockerPath" | "linuxPath" | "macPath" | "winPath";

const platformPathKey: Partial<Record<NodeJS.Platform, SectionPathKey>> = {
	darwin: "macPath",
	linux: "linuxPath",
	win32: "winPath",
};

function isRunningInDocker() {
	if (process.platform !== "linux") {
		return false;
	}

	if (process.env.DOCKER_CONTAINER?.trim() === "1") {
		return true;
	}

	if (fs.existsSync("/.dockerenv")) {
		return true;
	}

	try {
		const cgroup = fs.readFileSync("/proc/1/cgroup", "utf8").toLowerCase();
		return cgroup.includes("docker") || cgroup.includes("containerd") || cgroup.includes("kubepods");
	} catch {
		return false;
	}
}

export function getRuntimePathKey(): SectionPathKey | undefined {
	if (process.platform === "linux" && isRunningInDocker()) {
		return "dockerPath";
	}
	return platformPathKey[process.platform];
}

function getPathCandidates(section: RawConfigSection, pathKey?: SectionPathKey) {
	const runtimeCandidates =
		pathKey === "dockerPath"
			? [section?.dockerPath, section?.linuxPath]
			: [pathKey ? section[pathKey] : undefined];

	return [
		...runtimeCandidates,
		pathKey === "winPath" ? section?.pathWindows : undefined,
		section?.path,
		section?.dockerPath,
		section?.macPath,
		section?.linuxPath,
		section?.winPath,
		section?.pathWindows,
	] as Array<string | undefined>;
}

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(moduleDir, "..", "config.json");
const rawConfig = JSON.parse(fs.readFileSync(configPath, "utf8")) as AppConfig;

export function resolveSection(section: RawConfigSection): ConfigSection {
	const pathKey = getRuntimePathKey();
	const resolvedPath = getPathCandidates(section, pathKey).find(
		(candidate): candidate is string => typeof candidate === "string" && candidate.trim().length > 0,
	);

	return {
		...section,
		path: typeof resolvedPath === "string" ? resolvedPath.trim() : undefined,
	};
}

const rawSections = Array.isArray(rawConfig?.sections) ? rawConfig.sections : [];

const config: AppConfig = {
	...(rawConfig ?? {}),
	sections: rawSections.map((section) => resolveSection(section as RawConfigSection)),
};

export default config;
