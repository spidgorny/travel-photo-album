// @ts-nocheck
export function convertColumnsForDataTable(cols, dataRow = null) {
	const columns = Object.entries(cols).map(([x, nameid]) => {
		if (typeof nameid === "object") {
			return nameid;
		}
		return {
			id: x,
			name: cols[x],
			selector: (row) => row[x],
			sortable: true,
			center: typeof dataRow?.[x] === "number",
		};
	});

	return columns;
}
