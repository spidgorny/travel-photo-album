import {
	getDeleteQuery,
	getInsertQuery,
	getInsertUpdateQuery,
	getSelectQuery,
	getUpdateQuery,
} from "./query-builder.js";

export class MysqlTable {
	constructor(db, table) {
		this.TABLE = table;
		this.db = db;
	}

	async select(where, options = {}) {
		const query = getSelectQuery(this.TABLE, where, options);
		// console.log(query.query, query.values);
		return await this.db.query(query.query, query.values);
	}

	async selectQ(where, options = {}) {
		const query = getSelectQuery(this.TABLE, where, options);
		// console.log(query.query);
		const rows = await this.db.query(query.query, query.values);
		return { ...query, rows };
	}

	async selectOne(where, options = {}) {
		const query = getSelectQuery(this.TABLE, where, { ...options, size: 1 });
		// console.log(query.query);
		return (await this.db.query(query.query, query.values))[0];
	}

	async selectOneQ(where, options = {}) {
		const query = getSelectQuery(this.TABLE, where, { ...options, size: 1 });
		// console.log(query.query);
		const row = (await this.db.query(query.query, query.values))[0];
		return { query: query.query, values: query.values, row };
	}

	async insert(data) {
		const query = getInsertQuery(this.TABLE, data);
		// console.log(query.query, query.values);
		const res = await this.db.query(query.query, query.values);
		return { ...res, query: query.query, values: query.values };
	}

	async update(data, where) {
		const query = getUpdateQuery(this.TABLE, data, where);
		// console.log(query.query, query.values);
		const res = await this.db.query(query.query, query.values);
		return { ...res, query: query.query, values: query.values };
	}

	async insertUpdate(data, updatePlus = {}, insertPlus = {}) {
		const query = getInsertUpdateQuery(this.TABLE, data, updatePlus, insertPlus);
		// console.log(query.query, query.values);
		const res = await this.db.query(query.query, query.values);
		return { ...res, query: query.query, values: query.values };
	}

	async deleteOne(where) {
		const query = getDeleteQuery(this.TABLE, where);
		// console.log(query.query, query.values);
		const res = await this.db.query(query.query, query.values);
		return { ...res, query: query.query, values: query.values };
	}
}
