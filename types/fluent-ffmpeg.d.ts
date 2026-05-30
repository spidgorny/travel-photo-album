declare module "fluent-ffmpeg" {
export interface FfprobeStream {
codec_type?: string;
width?: number;
height?: number;
[key: string]: unknown;
}

export interface FfprobeData {
streams: FfprobeStream[];
format?: Record<string, unknown>;
chapters?: unknown[];
[key: string]: unknown;
}

export interface ScreenshotConfig {
count?: number;
folder?: string;
filename?: string;
size?: string;
timestamps?: Array<string | number>;
}

export default class FfmpegCommand {
constructor(input?: string);
static ffprobe(
input: string,
callback: (error: Error | null, data: FfprobeData) => void,
): void;
screenshots(config: ScreenshotConfig): this;
on(event: string, callback: (data?: unknown) => void): this;
}
}
