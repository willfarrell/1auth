import { test, describe, it } from "node:test";
import { equal, deepEqual } from "node:assert/strict";

import * as store from "../store-sql/index.js";

import { sqlTable } from "./table/sql.js";
import { query as sqliteQuery } from "./mock.sqlite.js";

const table = "test";
sqliteQuery(sqlTable(table));

store.default({
  log: (...args) => mocks.log(...args),
  query: (...args) => mocks.query(...args),
  placeholder: "?",
});

const mocks = {
  log: () => {}, // console.log,
  query: sqliteQuery,
};

test.beforeEach(async (t) => {
  t.mock.method(mocks, "log");
  t.mock.method(mocks, "query");
});

test.afterEach(async (t) => {
  t.mock.reset();
  await store.__clear(table);
});

describe("store-sql", () => {
  it("`exists` Should return undefined when nothing found", async () => {
    const result = await store.exists(table, { id: 1 });
    equal(result, undefined);
    equal(mocks.log.mock.calls.length, 1);
  });
  it("`exists` Should return sub when something found", async () => {
    const row = { id: 1, sub: "sub_000", value: "a" };
    await store.insert(table, row);
    const result = await store.exists(table, { id: row.id });
    equal(result, row.sub);
    equal(mocks.log.mock.calls.length, 2);
  });
  it("`count` Should return 0 when nothing found", async () => {
    const result = await store.count(table, { id: 1 });
    equal(result, 0);
    equal(mocks.log.mock.calls.length, 1);
  });
  it("`count` Should return # when something found", async () => {
    const row = { id: 1, sub: "sub_000", value: "a" };
    await store.insert(table, row);
    const result = await store.count(table, { id: row.id });
    equal(result, 1);
    equal(mocks.log.mock.calls.length, 2);
  });
  it("`select` Should return undefined when nothing found", async () => {
    const result = await store.select(table, { id: 1 });
    equal(result, undefined);
    equal(mocks.log.mock.calls.length, 1);
  });
  it("`insert`/`update`/`select` Should return object when something found", async () => {
    const row = { id: 1, sub: "sub_000", value: "a" };
    const id = await store.insert(table, row);
    equal(id, row.id);
    //let result = await store.select(table, { id: row.id });
    row.value = "b";
    await store.update(
      table,
      { sub: "sub_000", id: row.id },
      { value: row.value },
    );
    let result = await store.select(table, { id: row.id });
    equal(JSON.stringify(result), JSON.stringify(row)); // sqlite uses Object.create(null)
    equal(mocks.log.mock.calls.length, 3);
  });
  it("`selectList` Should return [] when nothing found", async () => {
    const result = await store.selectList(table, { id: 1 });
    deepEqual(result, []);
    equal(mocks.log.mock.calls.length, 1);
  });
  it("`insertList`/`selectList` Should return object[] when something found", async () => {
    const rows = [
      { id: 1, sub: "sub_000", value: "a" },
      { id: 2, sub: "sub_000", value: "b" },
    ];
    await store.insertList(table, rows);
    let result = await store.selectList(table, { id: rows[0].id });
    equal(JSON.stringify(result), JSON.stringify([rows[0]])); // sqlite uses Object.create(null)
    equal(mocks.log.mock.calls.length, 2);

    result = await store.selectList(table, { sub: rows[0].sub });
    equal(JSON.stringify(result), JSON.stringify(rows)); // sqlite uses Object.create(null)
    equal(mocks.log.mock.calls.length, 3);
  });
  it("`remove` Should remove row in store using {id:''}", async () => {
    const rows = [
      { id: 1, sub: "sub_000", value: "a" },
      { id: 2, sub: "sub_000", value: "b" },
    ];
    await store.insertList(table, rows);
    await store.remove(table, { sub: "sub_000", id: rows[0].id });
    const result = await store.selectList(table, { sub: rows[0].sub });
    equal(JSON.stringify(result), JSON.stringify([rows[1]])); // sqlite uses Object.create(null)
    equal(mocks.log.mock.calls.length, 3);
  });
  it("`remove` Should remove row in store using {id:'', sub:''}", async () => {
    const rows = [
      { id: 1, sub: "sub_000", value: "a" },
      { id: 2, sub: "sub_000", value: "b" },
    ];
    await store.insertList(table, rows);
    await store.remove(table, { sub: rows[0].sub, id: rows[0].id });
    const result = await store.selectList(table, { sub: rows[0].sub });
    equal(JSON.stringify(result), JSON.stringify([rows[1]])); // sqlite uses Object.create(null)
    equal(mocks.log.mock.calls.length, 3);
  });
  it("`remove` Should remove rows in store using {id:[]}", async () => {
    const rows = [
      { id: 1, sub: "sub_000", value: "a" },
      { id: 2, sub: "sub_000", value: "b" },
      { id: 3, sub: "sub_000", value: "c" },
    ];
    await store.insertList(table, rows);
    await store.remove(table, { sub: "sub_000", id: [rows[0].id, rows[1].id] });
    const result = await store.selectList(table, { sub: rows[0].sub });
    equal(JSON.stringify(result), JSON.stringify([rows[2]])); // sqlite uses Object.create(null)
    equal(mocks.log.mock.calls.length, 3);
  });

  describe("makeSqlParts (SQLite)", () => {
    it("Should format {select} properly", async (t) => {
      const filters = {};
      const values = {};
      const fields = ["a", "b"];

      store.default({ placeholder: "?" });
      const { select, parameters } = store.makeSqlParts(
        filters,
        values,
        fields,
      );

      equal(select, '"a", "b"');
      deepEqual(parameters, []);
    });

    it("Should format {select} to *", async (t) => {
      const filters = {};
      const values = {};
      const fields = [];

      store.default({ placeholder: "?" });
      const { select, parameters } = store.makeSqlParts(
        filters,
        values,
        fields,
      );

      equal(select, "*");
      deepEqual(parameters, []);
    });

    it("Should format {insert} properly", async (t) => {
      const filters = {};
      const values = { a: "a", b: "b" };

      store.default({ placeholder: "?" });
      const { insert, parameters } = store.makeSqlParts(filters, values);

      equal(insert, '("a", "b") VALUES (?,?)');
      deepEqual(parameters, ["a", "b"]);
    });

    it("Should format {update} properly", async (t) => {
      const filters = {};
      const values = { a: "a", b: "b" };

      store.default({ placeholder: "?" });
      const { update, parameters } = store.makeSqlParts(filters, values);

      equal(update, '"a" = ?, "b" = ?');
      deepEqual(parameters, ["a", "b"]);
    });

    it("Should format {where} properly", async (t) => {
      const filters = { a: "a", bc: ["b", "c"], d: "d" };

      store.default({ placeholder: "?" });
      const { where, parameters } = store.makeSqlParts(filters);

      equal(where, 'WHERE "a" = ? AND "bc" IN (?,?) AND "d" = ?');
      deepEqual(parameters, ["a", "b", "c", "d"]);
    });
  });
  describe("makeSqlParts (PostgreSQL)", () => {
    it("Should format {select} properly", async (t) => {
      const filters = {};
      const values = {};
      const fields = ["a", "b"];

      store.default({ placeholder: "$" });
      const { select, parameters } = store.makeSqlParts(
        filters,
        values,
        fields,
      );

      equal(select, '"a", "b"');
      deepEqual(parameters, []);
    });

    it("Should format {select} to *", async (t) => {
      const filters = {};
      const values = {};
      const fields = [];

      store.default({ placeholder: "$" });
      const { select, parameters } = store.makeSqlParts(
        filters,
        values,
        fields,
      );

      equal(select, "*");
      deepEqual(parameters, []);
    });

    it("Should format {insert} properly", async (t) => {
      const filters = {};
      const values = { a: "a", b: "b" };

      store.default({ placeholder: "$" });
      const { insert, parameters } = store.makeSqlParts(filters, values);

      equal(insert, '("a", "b") VALUES ($1,$2)');
      deepEqual(parameters, ["a", "b"]);
    });

    it("Should format {update} properly", async (t) => {
      const filters = {};
      const values = { a: "a", b: "b" };

      store.default({ placeholder: "$" });
      const { update, parameters } = store.makeSqlParts(filters, values);

      equal(update, '"a" = $1, "b" = $2');
      deepEqual(parameters, ["a", "b"]);
    });

    it("Should format {where} properly", async (t) => {
      const filters = { a: "a", bc: ["b", "c"], d: "d" };

      store.default({ placeholder: "$" });
      const { where, parameters } = store.makeSqlParts(filters);

      equal(where, 'WHERE "a" = $1 AND "bc" IN ($2,$3) AND "d" = $4');
      deepEqual(parameters, ["a", "b", "c", "d"]);
    });
  });
});
