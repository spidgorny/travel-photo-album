import type { ConfigSection } from "../config/config.ts";

export const descriptionQueueUrl =
	process.env.DESCRIPTION_QUEUE_URL?.trim() ||
	process.env.THUMB_QUEUE_URL?.trim() ||
	process.env.BULLMQ_REDIS_URL?.trim() ||
	"";

export const descriptionQueueName =
	process.env.DESCRIPTION_QUEUE_NAME?.trim() || "description-jobs";
export const descriptionQueuePrefix =
	process.env.DESCRIPTION_QUEUE_PREFIX?.trim() ||
	process.env.THUMB_QUEUE_PREFIX?.trim() ||
	"travel-photo-album";

export const descriptionJobActions = {
	generateImageDescription: "generate-image-description",
} as const;

export interface GenerateImageDescriptionJob {
	action: typeof descriptionJobActions.generateImageDescription;
	sectionId: number;
	section?: ConfigSection;
	filePath: string[];
	variant?: string;
	force?: boolean;
}

export type DescriptionJobData = GenerateImageDescriptionJob;

export function isDescriptionQueueConfigured() {
	return descriptionQueueUrl.length > 0;
}
