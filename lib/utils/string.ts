export function capitalizeFirstLetter(str: string): string;
export function capitalizeFirstLetter(str: undefined): undefined;
export function capitalizeFirstLetter(str: null): null;
export function capitalizeFirstLetter(
	str: string | null | undefined,
): string | null | undefined {
	return str ? str.charAt(0).toUpperCase() + str.slice(1).toLowerCase() : str;
}

export function capitalizeEveryWord(str: string): string {
	return str
		.split(/\s/)
		.map((word) => capitalizeFirstLetter(word) ?? "")
		.join(" ");
}
