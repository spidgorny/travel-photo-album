export function getTabsWithPrimaryFirst(rows) {
	let PRIMARY = "Primary";
	const primaryInfo = rows?.find((x) => x.tab === PRIMARY);
	let tabs = [
		{ tab: PRIMARY, ...primaryInfo, count: primaryInfo?.count ?? 0 },
		...rows?.filter((x) => x.tab !== PRIMARY),
	];
	return tabs;
}
