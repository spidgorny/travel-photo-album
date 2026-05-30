import fs from "fs/promises";
import type { ConfigSection } from "./config.ts";
import { normalizeStoredDescription } from "./file-meta.ts";
import type { ThumbImageMetaData } from "./thumb-jobs.ts";

const defaultCaptionPrompt =
	"Write one short searchable description for this travel photo. Mention the scene, location clues, landmarks, notable objects, weather, and time of day if clearly visible. Use plain factual language, one sentence, no markdown.";

export const ollamaBaseUrl = process.env.OLLAMA_BASE_URL?.trim() || "";
export const ollamaModel = process.env.OLLAMA_MODEL?.trim() || "";
const ollamaCaptionPrompt = process.env.OLLAMA_CAPTION_PROMPT?.trim() || defaultCaptionPrompt;

export function isAutoDescriptionEnabled() {
	return Boolean(ollamaBaseUrl && ollamaModel);
}

export async function maybeGenerateImageDescription({
	section,
	filePath,
	thumb,
	metaData,
}: {
	section: ConfigSection;
	filePath: string[];
	thumb: {
		kind: "buffer" | "file";
		buffer?: Buffer;
		path?: string;
		mimeType: string;
	};
	metaData: ThumbImageMetaData;
}) {
	const existingDescription = normalizeStoredDescription(metaData.description);
	if (existingDescription || !isAutoDescriptionEnabled()) {
		return existingDescription;
	}

	try {
		const imagePayload = await readThumbPayload(thumb);
		const description = await requestOllamaCaption(imagePayload);
		return normalizeStoredDescription(description);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.warn(
			"image-description",
			`caption generation failed for ${section.name}:${filePath.join("/")}`,
			message,
		);
		return undefined;
	}
}

async function readThumbPayload(thumb: {
	kind: "buffer" | "file";
	buffer?: Buffer;
	path?: string;
	mimeType: string;
}) {
	const buffer =
		thumb.kind === "buffer" ? thumb.buffer : thumb.path ? await fs.readFile(thumb.path) : null;
	if (!buffer) {
		throw new Error("thumbnail payload missing");
	}
	return {
		base64: buffer.toString("base64"),
	};
}

async function requestOllamaCaption(imagePayload: { base64: string }) {
	const endpoint = new URL("api/generate", ensureTrailingSlash(ollamaBaseUrl)).toString();
	const response = await fetch(endpoint, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			model: ollamaModel,
			prompt: ollamaCaptionPrompt,
			stream: false,
			images: [imagePayload.base64],
		}),
	});
	if (!response.ok) {
		throw new Error(`Ollama returned ${response.status}`);
	}
	const payload = (await response.json()) as {
		response?: string;
		error?: string;
	};
	if (typeof payload.response === "string") {
		return payload.response;
	}
	throw new Error(payload.error || "Ollama response did not include caption text");
}

function ensureTrailingSlash(value: string) {
	return value.endsWith("/") ? value : `${value}/`;
}
