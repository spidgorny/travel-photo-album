"use client";

export function Loading() {
	return (
		<div className="flex items-center gap-3 text-sm text-slate-300">
			<div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-500 border-t-sky-300" />
			<span>Loading...</span>
		</div>
	);
}
