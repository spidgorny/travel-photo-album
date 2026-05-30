export interface RawConfigSection {
	name: string;
	from?: string;
	linuxPath?: string;
	macPath?: string;
	path?: string;
	thumbPath?: string;
	winPath?: string;
}

export interface ConfigSection extends RawConfigSection {
	path?: string;
}

export interface AppConfig {
	sections: ConfigSection[];
}

export const LAMBDA_ONWATER_URL: string;
export const LAMBDA_ONWATER_TOKEN: string;
export const lambdaBase: string;
export function resolveSection(section: RawConfigSection): ConfigSection;

declare const config: AppConfig;

export default config;
