import type { ConfigSection } from "./config";

export interface ThumbQueueOptions {
	queueRoot?: string;
}

export interface ThumbQueueJobData {
	action?: string;
	section?: ConfigSection;
	filePath?: string[];
	[key: string]: unknown;
}

export class ThumbQueue {
	queueRoot: string;
	constructor(options?: ThumbQueueOptions);
	enqueue(data: ThumbQueueJobData): Promise<void>;
	makeHash(data: unknown): string;
	getJob(): (ThumbQueueJobData & { jobHash: string }) | null;
	readFiles(): void;
	removeJob(jobHash: string): void;
	readonly length: number;
}
