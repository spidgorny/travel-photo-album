"use client";

export function Loading() {
	return (
		<div className="flex items-center gap-3 text-sm text-slate-300">
			<div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-500 border-t-sky-300" />
			<span>Loading...</span>
		</div>
	);
}

export function ErrorState({
	message,
	details,
	error,
	url,
	onRetry,
	retryLabel = "Retry",
}: {
	message: string;
	details?: string;
	error?: unknown;
	url?: string;
	onRetry?: () => void | Promise<unknown>;
	retryLabel?: string;
}) {
	const errorMessage = details ?? getErrorMessage(error);
	const errorStatus = getErrorStatus(error);
	const errorUrl = url ?? getErrorUrl(error);
	const errorInfo = getErrorInfo(error);

	return (
		<div className="rounded-[1.5rem] border border-rose-400/20 bg-rose-400/10 px-4 py-4 text-sm text-rose-100">
			<div className="font-medium">{message}</div>
			{errorMessage ? <div className="mt-1 text-rose-100/80">{errorMessage}</div> : null}
			{errorStatus || errorUrl ? (
				<dl className="mt-3 space-y-2 rounded-xl border border-rose-300/15 bg-black/10 px-3 py-2 text-xs text-rose-50/90">
					{errorStatus ? (
						<div>
							<dt className="font-semibold uppercase tracking-[0.16em] text-rose-100/70">Status</dt>
							<dd className="mt-0.5">{errorStatus}</dd>
						</div>
					) : null}
					{errorUrl ? (
						<div>
							<dt className="font-semibold uppercase tracking-[0.16em] text-rose-100/70">URL</dt>
							<dd className="mt-0.5 break-all font-mono text-[11px]">{errorUrl}</dd>
						</div>
					) : null}
				</dl>
			) : null}
			{errorInfo && errorInfo !== errorMessage ? (
				<pre className="mt-3 overflow-x-auto rounded-xl border border-rose-300/15 bg-black/10 px-3 py-2 text-xs text-rose-50/90 whitespace-pre-wrap break-words">
					{errorInfo}
				</pre>
			) : null}
			{onRetry ? (
				<div className="mt-3">
					<button
						type="button"
						onClick={() => {
							void onRetry();
						}}
						className="rounded-xl border border-rose-200/30 bg-rose-100/10 px-3 py-2 text-sm font-medium text-rose-50 transition hover:border-rose-100/40 hover:bg-rose-100/20"
					>
						{retryLabel}
					</button>
				</div>
			) : null}
		</div>
	);
}

export function getErrorMessage(error: unknown) {
	if (error instanceof Error && error.message) {
		return error.message;
	}

	if (typeof error === "string" && error) {
		return error;
	}

	return undefined;
}

export function getErrorUrl(error: unknown) {
	if (error && typeof error === "object" && "url" in error && typeof error.url === "string") {
		return error.url;
	}

	return undefined;
}

export function getErrorStatus(error: unknown) {
	if (error && typeof error === "object" && "status" in error && typeof error.status === "number") {
		return String(error.status);
	}

	return undefined;
}

export function getErrorInfo(error: unknown) {
	if (!error || typeof error !== "object" || !("info" in error)) {
		return undefined;
	}

	const info = error.info;
	if (typeof info === "string") {
		return info || undefined;
	}

	if (info === null || info === undefined) {
		return undefined;
	}

	try {
		return JSON.stringify(info, null, 2);
	} catch {
		return String(info);
	}
}
