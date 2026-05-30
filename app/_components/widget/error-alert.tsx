"use client";

interface ErrorAlertProps {
	error?: unknown;
}

function getErrorMessage(error: unknown) {
	if (error instanceof Error) {
		return error.message;
	}

	if (typeof error === "string") {
		return error;
	}

	return error ? JSON.stringify(error) : "Unknown error";
}

export function ErrorAlert({ error }: ErrorAlertProps) {
	return (
		<div className="rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
			{getErrorMessage(error)}
		</div>
	);
}
