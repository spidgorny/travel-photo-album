import { requiresAuth } from "./auth-check.js";
import { MysqlTable } from "./mysql/mysql-table.js";
import invariant from "tiny-invariant";

export async function methodHandler(req, res, methodMap) {
  const start = new Date();
  try {
    await requiresAuth(req, res);
    let method = req.method;
    if (req?.body?.__method) {
      method = req.body.__method;
    }
    if (req?.query?.__method) {
      method = req.query.__method;
    }
    let actionFunction = methodMap[method];
    invariant(actionFunction, `no handler for [${method}]`);
    const json = await actionFunction(req, res);
    res.status(200).json({
      method: method,
      ...json,
      runtime: (new Date() - start) / 1000,
    });
  } catch (e) {
    res.status(500).json({
      status: "error",
      message: e.message,
      stack: e.stack.split("\n"),
    });
  }
}

export class GeneralApiEndpoint {
  /** @param table {MysqlTable} */
  constructor(table) {
    this.table = table;
  }

  async handle(req, res) {
    const methodMap = {
      GET: this.handleGet.bind(this),
      PUT: this.handlePut.bind(this),
      POST: this.handlePost.bind(this),
      PATCH: this.handlePatch.bind(this),
      DELETE: this.handleDelete.bind(this),
    };
    return methodHandler(req, res, methodMap);
  }

  // one or more rows
  async handleGet(req) {
    const where = req.query;
    const results = await this.table.select(where);
    // console.log(this.table.TABLE, results.length);
    return { table: this.table.TABLE, results };
  }

  // insert or update
  async handlePost(req) {
    const result = await this.table.insertUpdate(req.body);
    // console.log(this.table.TABLE, result);
    return result;
  }

  // insert the whole row
  async handlePut(req) {
    const result = await this.table.insert(req.body);
    // console.log(this.table.TABLE, result);
    return result;
  }

  // modify some fields
  async handlePatch(req) {
    const id = req.query.id ?? req.body.id;
    invariant(id, "need id");
    const update = req.body;
    invariant(Object.keys(update).length, "need post body");
    const result = await this.table.update(update, { id });
    // console.log(this.table.TABLE, result);
    return result;
  }

  // delete row
  async handleDelete(req) {
    const id = req.query.id;
    invariant(id, "need ?id in URL");
    const result = await this.table.deleteOne({ id });
    // console.log(this.table.TABLE, result);
    return result;
  }
}
