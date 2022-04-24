import mysql from "mysql2/promise.js";
import { MysqlTable } from "./mysql-table.js";

export class MysqlConnector {
  connection;

  constructor(config) {
    console.warn("NEW MYSQL CONNECTION");
    this.connection = mysql.createPool(config);

    this.connection.on("error", function (err) {
      console.error("MYSQL Error event triggered. Connection is dead: ", err);
      process.exit(1);
    });

    this.query("SET time_zone = 'America/New_York'", []);
  }

  getTable(tableName) {
    return new MysqlTable(this, tableName);
  }

  async query(sql, args) {
    const [rows] = await this.connection.query(sql, args);
    return rows;
  }

  async close() {
    await this.connection.end();
  }
}
