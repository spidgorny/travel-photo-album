export function getFormDataNew(form) {
	return Object.fromEntries(new FormData(form).entries());
}

export function getFormData(form) {
	let elements = Array.from(form.elements).filter((x) => !x.disabled);
	// elements = elements.filter((x) => (["radio", "checkbox"].includes(x.type) ? x.checked : x.value));
	let entries = elements.map((x) => {
		console.log(x.name, x.type);
		return [
			x.name ?? x.id,
			x.type === "number"
				? Number(x.value)
				: x.type === "checkbox"
				? Number(x.checked ?? 0)
				: // : x.type === "radio"
				  // ? Number(x.checked ?? 0)
				  x.value,
		];
	});
	entries = entries.map(([key, val]) => [key, val]);
	entries = entries.filter((x) => x[0]);
	return Object.fromEntries(entries);
}

export function clearForm(form) {
	const elements = form.elements;
	Array.from(elements).forEach((x) => (x.value = x.defaultValue));
}
