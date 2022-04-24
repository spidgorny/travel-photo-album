import Builder from "json-sql";

const jsonSql = Builder({
	namedValues: false,
	valuesPrefix: "$$",
});
jsonSql.setDialect("mysql");

export function getSelectQuery(tableName, condition, options = {}) {
	const sql = jsonSql.build({
		type: "select",
		table: tableName,
		condition,
		...options,
	});
	sql.query = sql.query.replace(/\$\$\d+/g, "?");
	return sql;
}

export function getInsertQuery(tableName, insertFields) {
	const sql = jsonSql.build({
		type: "insert",
		table: tableName,
		values: insertFields,
	});
	sql.query = sql.query.replace(/\$\$\d+/g, "?");
	return sql;
}

export function getUpdateQuery(tableName, updateFields, condition) {
	const sql = jsonSql.build({
		type: "update",
		table: tableName,
		condition,
		modifier: updateFields,
	});
	sql.query = sql.query.replace(/\$\$\d+/g, "?");
	return sql;
}

export function getInsertUpdateQuery(tableName, insertFields, updatePlus = {}, insertPlus = {}) {
	const insert = getInsertQuery(tableName, { ...insertFields, ...insertPlus });
	insert.query = insert.query.substring(0, insert.query.length - 1); // remove ";"
	insert.query += " ON DUPLICATE KEY ";
	const update = getUpdateQuery(tableName, { ...insertFields, ...updatePlus });
	insert.query += update.query.replace("`" + tableName + "` set", "");
	insert.values = [...insert.values, ...update.values];
	return insert;
}

export function getDeleteQuery(tableName, condition, options = {}) {
	const sql = jsonSql.build({
		type: "remove",
		table: tableName,
		condition,
		...options,
	});
	sql.query = sql.query.replace(/\$\$\d+/g, "?");
	return sql;
}
