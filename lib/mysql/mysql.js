import { MysqlConnector } from "./mysql-connector.js";

let anyDB = {};

export function getAnyCoreLinuxDB(dbName) {
  if (!dbName) {
    dbName = process.env.MYSQL_DATABASE;
  }
  if (anyDB[dbName]) {
    return anyDB[dbName];
  }
  anyDB[dbName] = new MysqlConnector({
    host: process.env.MYSQL_HOST,
    database: dbName,
    user: process.env.MYSQL_USERNAME,
    password: process.env.MYSQL_PASSWORD,
    port: parseInt(process.env.MYSQL_PORT),
  });
  return anyDB[dbName];
}
