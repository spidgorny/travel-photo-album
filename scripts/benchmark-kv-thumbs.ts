import "../lib/system/load-env.ts";
import crypto from "crypto";
import path from "path";
import process from "process";
import sharp from "sharp";
import invariant from "tiny-invariant";
import config from "../lib/config/config.ts";
import { listStoredMetaFilePaths } from "../lib/media/file-meta.ts";
import {
	closeThumbKvClient,
	getThumbKvClient,
	isImagePath,
	thumbnailTargetWidth,
	thumbKvPrefix,
} from "../lib/media/thumb-store.ts";

const defaultVariant = `w${thumbnailTargetWidth}-jpeg`;

async function main() {
	const options = parseArgs(process.argv.slice(2));
	if (options.help) {
		printUsage();
		return;
	}

	const client = await getThumbKvClient();
	invariant(client, "Kvrocks thumbnail store is not configured");

	const candidates = await collectBenchmarkCandidates();
	invariant(candidates.length > 0, "No indexed image files found in Kvrocks");

	console.log(
		`Loaded ${candidates.length} indexed image files from ${thumbKvPrefix}. Starting benchmark...`,
	);

	let stopped = false;
	process.on("SIGINT", () => {
		stopped = true;
	});

	const stats = {
		frames: 0,
		totalFetchMs: 0,
		totalRenderMs: 0,
		totalFrameMs: 0,
	};

	let nextFramePromise = loadFrame(client, candidates, options.width);
	while (!stopped && (options.limit <= 0 || stats.frames < options.limit)) {
		const frame = await nextFramePromise;

		stats.frames += 1;
		stats.totalFetchMs += frame.fetchMs;
		stats.totalRenderMs += frame.renderMs;
		stats.totalFrameMs += frame.totalMs;

		renderFrame(frame, stats, options);

		if (!stopped && (options.limit <= 0 || stats.frames < options.limit)) {
			nextFramePromise = loadFrame(client, candidates, options.width);
		}

		if (options.delayMs > 0) {
			await sleep(options.delayMs);
		}
	}
}

interface BenchmarkCandidate {
	sectionName: string;
	filePath: string[];
	fileName: string;
	displayPath: string;
}

async function collectBenchmarkCandidates() {
	const candidates: BenchmarkCandidate[] = [];
	for (const [, section] of config.sections.entries()) {
		const filePaths = await listStoredMetaFilePaths(section);
		for (const filePath of filePaths) {
			if (!isImagePath(filePath)) {
				continue;
			}
			candidates.push({
				sectionName: section.name,
				filePath,
				fileName: path.basename(filePath.join("/")),
				displayPath: `${section.name}/${filePath.join("/")}`,
			});
		}
	}
	return candidates;
}

async function loadFrame(
	client: Awaited<ReturnType<typeof getThumbKvClient>>,
	candidates: BenchmarkCandidate[],
	width: number,
) {
	for (let attempt = 0; attempt < 25; attempt += 1) {
		const candidate = candidates[Math.floor(Math.random() * candidates.length)];
		const key = buildBlobKey(candidate.sectionName, candidate.filePath);
		const frameStartedAt = Date.now();

		const fetchStartedAt = Date.now();
		const encoded = await client.get(key);
		const fetchMs = Date.now() - fetchStartedAt;
		if (!encoded) {
			continue;
		}

		const buffer = Buffer.from(encoded, "base64");
		const renderStartedAt = Date.now();
		const image = await bufferToTruecolorBlocks(buffer, width);
		const renderMs = Date.now() - renderStartedAt;

		return {
			key,
			fileName: candidate.fileName,
			displayPath: candidate.displayPath,
			bufferBytes: buffer.length,
			image,
			fetchMs,
			renderMs,
			totalMs: Date.now() - frameStartedAt,
		};
	}

	throw new Error("Unable to find a stored thumbnail blob for sampled image files");
}

async function bufferToTruecolorBlocks(buffer: Buffer, width: number) {
	const pipeline = sharp(buffer).rotate().removeAlpha();
	const metadata = await pipeline.metadata();
	const sourceWidth = metadata.width ?? width;
	const sourceHeight = metadata.height ?? Math.max(1, Math.round(width * 0.6));
	const targetWidth = Math.max(16, Math.min(width, sourceWidth));
	const targetPixelHeight = ensureEven(
		Math.max(8, Math.round((sourceHeight / sourceWidth) * targetWidth)),
	);
	const { data, info } = await pipeline
		.resize({
			width: targetWidth,
			height: targetPixelHeight,
			fit: "fill",
		})
		.raw()
		.toBuffer({ resolveWithObject: true });

	const lines: string[] = [];
	for (let row = 0; row < info.height; row += 2) {
		let line = "";
		for (let column = 0; column < info.width; column += 1) {
			const top = readPixel(data, info.width, info.channels, row, column);
			const bottom = readPixel(
				data,
				info.width,
				info.channels,
				Math.min(row + 1, info.height - 1),
				column,
			);
			line += `${toAnsiColor(top, "38")}${toAnsiColor(bottom, "48")}▀`;
		}
		lines.push(`${line}\x1b[0m`);
	}

	return lines.join("\n");
}

function renderFrame(
	frame: Awaited<ReturnType<typeof loadFrame>>,
	stats: { frames: number; totalFetchMs: number; totalRenderMs: number; totalFrameMs: number },
	options: ReturnType<typeof parseArgs>,
) {
	if (options.clear && process.stdout.isTTY) {
		process.stdout.write("\x1b[2J\x1b[H");
	}

	const averageFetchMs = stats.totalFetchMs / stats.frames;
	const averageRenderMs = stats.totalRenderMs / stats.frames;
	const averageFrameMs = stats.totalFrameMs / stats.frames;
	const framesPerSecond = averageFrameMs > 0 ? 1000 / averageFrameMs : 0;
	const keyHash = frame.key.split(":").pop() || frame.key;

	process.stdout.write(
		[
			`KVrocks thumbnail benchmark  frame ${stats.frames}${options.limit > 0 ? `/${options.limit}` : ""}`,
			`file ${frame.fileName}`,
			`path ${frame.displayPath}`,
			`key ${keyHash}  size ${formatBytes(frame.bufferBytes)}`,
			`fetch ${frame.fetchMs}ms (avg ${averageFetchMs.toFixed(1)}ms)  render ${frame.renderMs}ms (avg ${averageRenderMs.toFixed(1)}ms)  total ${frame.totalMs}ms (avg ${averageFrameMs.toFixed(1)}ms / ${framesPerSecond.toFixed(2)} fps)`,
			"",
			frame.image,
			"",
			"Ctrl+C to stop",
			"",
		].join("\n"),
	);
}

function parseArgs(args: string[]) {
	return {
		width: clampNumber(readNumberFlag(args, "--width") ?? getDefaultWidth(), 16, 160),
		delayMs: clampNumber(readNumberFlag(args, "--delay-ms") ?? 0, 0, 60_000),
		limit: Math.max(0, readNumberFlag(args, "--limit") ?? 0),
		clear: !args.includes("--no-clear"),
		help: args.includes("--help") || args.includes("-h"),
	};
}

function readNumberFlag(args: string[], flag: string) {
	const index = args.indexOf(flag);
	if (index < 0) {
		return null;
	}
	const value = Number(args[index + 1]);
	return Number.isFinite(value) ? value : null;
}

function clampNumber(value: number, min: number, max: number) {
	return Math.max(min, Math.min(max, value));
}

function getDefaultWidth() {
	const terminalWidth = process.stdout.columns ?? 80;
	return Math.max(32, Math.min(terminalWidth - 4, 100));
}

function buildBlobKey(sectionName: string, filePath: string[], variant = defaultVariant) {
	const hash = crypto
		.createHash("sha1")
		.update(JSON.stringify({ sectionName, filePath: filePath.join("/"), variant }))
		.digest("hex");
	return `${thumbKvPrefix}:blob:${hash}`;
}

function formatBytes(bytes: number) {
	if (!bytes) {
		return "0 B";
	}
	const units = ["B", "KB", "MB", "GB"];
	const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
	const value = bytes / 1024 ** unitIndex;
	return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function sleep(delayMs: number) {
	return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function ensureEven(value: number) {
	return value % 2 === 0 ? value : value + 1;
}

function readPixel(
	data: Buffer,
	width: number,
	channels: number,
	row: number,
	column: number,
) {
	const offset = (row * width + column) * channels;
	return {
		red: data[offset] ?? 0,
		green: data[offset + 1] ?? 0,
		blue: data[offset + 2] ?? 0,
	};
}

function toAnsiColor(
	color: { red: number; green: number; blue: number },
	mode: "38" | "48",
) {
	return `\x1b[${mode};2;${color.red};${color.green};${color.blue}m`;
}

function printUsage() {
	console.log(`Usage: npm run benchmark:thumbs -- [--width 80] [--delay-ms 0] [--limit 0] [--no-clear]

Randomly samples thumbnail blobs from Kvrocks, renders them with truecolor terminal blocks, and
prints per-frame fetch/render timings so thumbnail-store performance is visible.

Options:
  --width <n>      Output width in terminal cells (default: terminal width, max 160)
  --delay-ms <n>   Pause between frames (default: 0)
  --limit <n>      Stop after n frames (default: 0 = run until Ctrl+C)
  --no-clear       Do not clear the screen between frames
`);
}

main()
	.catch((error) => {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	})
	.finally(async () => {
		await closeThumbKvClient();
	});
