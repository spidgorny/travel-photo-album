export interface TabRow {
	tab?: string;
	count?: number;
}

export function getTabsWithPrimaryFirst<T extends TabRow>(
	rows: readonly T[] | null | undefined,
): Array<T | ({ tab: string; count: number } & Partial<T>)> {
	const PRIMARY = "Primary";
	const primaryInfo = rows?.find((row) => row.tab === PRIMARY);
	const primaryTab = {
		tab: PRIMARY,
		...primaryInfo,
		count: primaryInfo?.count ?? 0,
	} as { tab: string; count: number } & Partial<T>;
	const tabs: Array<T | ({ tab: string; count: number } & Partial<T>)> = [
		primaryTab,
		...(rows?.filter((row) => row.tab !== PRIMARY) ?? []),
	];
	return tabs;
}
