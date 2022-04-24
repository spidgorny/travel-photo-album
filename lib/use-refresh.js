import { useEffect } from "react";

export function useAutoRefresh(mutateFunc, timeout = 1000) {
	useEffect(() => {
		const timer = setInterval(async () => {
			await mutateFunc();
		}, timeout);
		return () => clearTimeout(timer);
	});
}
