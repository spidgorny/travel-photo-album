export function formatSQL(query) {
	query = query?.replace(/\t/, " ");
	query = query?.replace(/\n/, " ");
	query = query?.replace(/\s+/g, " ");
	return query;
}
