export function capitalizeFirstLetter(str) {
	return str ? str.charAt(0).toUpperCase() + str.slice(1).toLowerCase() : str;
}

export function capitalizeEveryWord(str) {
	return str
		.split(/\s/)
		.map((x) => capitalizeFirstLetter(x))
		.join(" ");
}
