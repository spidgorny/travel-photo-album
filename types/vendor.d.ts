declare module "luxon" {
	export class DateTime {
		static now(): DateTime;
		plus(duration: { days?: number }): DateTime;
		toHTTP(): string;
	}
}

declare module "mime-types" {
	export function lookup(path: string): string | false;

	const mime: {
		lookup: typeof lookup;
	};

	export default mime;
}
