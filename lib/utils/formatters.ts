const CURRENCY_FORMATTER = new Intl.NumberFormat(undefined, {
	currency: "USD",
	style: "currency",
});

export function formatCurrency(value: number): string {
	return CURRENCY_FORMATTER.format(value);
}

const NUMBER_FORMATTER = new Intl.NumberFormat(undefined);

export function formatNumber(value: number): string {
	return NUMBER_FORMATTER.format(value);
}

const COMPACT_NUMBER_FORMATTER = new Intl.NumberFormat(undefined, {
	notation: "compact",
});

export function formatCompactNumber(value: number): string {
	return COMPACT_NUMBER_FORMATTER.format(value);
}

const DIVISIONS: ReadonlyArray<{
	amount: number;
	name: Intl.RelativeTimeFormatUnit;
}> = [
	{ amount: 60, name: "second" },
	{ amount: 60, name: "minute" },
	{ amount: 24, name: "hour" },
	{ amount: 7, name: "day" },
	{ amount: 4.34524, name: "week" },
	{ amount: 12, name: "month" },
	{ amount: Number.POSITIVE_INFINITY, name: "year" },
];
const RELATIVE_DATE_FORMATTER = new Intl.RelativeTimeFormat(undefined, {
	numeric: "auto",
});

export function formatRelativeDate(
	toDate: Date,
	fromDate: Date = new Date(),
): string | undefined {
	let duration = (toDate.getTime() - fromDate.getTime()) / 1000;

	for (const division of DIVISIONS) {
		if (Math.abs(duration) < division.amount) {
			return RELATIVE_DATE_FORMATTER.format(
				Math.round(duration),
				division.name,
			);
		}
		duration /= division.amount;
	}
}
