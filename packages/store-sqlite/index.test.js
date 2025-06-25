import { deepEqual, equal } from "node:assert/strict";
import { describe, it } from "node:test";
import tests from "../store/index.test.js";
import * as store from "./index.js";
import * as mockDatabase from "./mock.js";
import * as mockDatabaseTable from "./table/sqlite.js";

store.default({
	log: (...args) => mocks.log(...args),
	client: {
		query: (...args) => mocks.storeClient.query(...args),
	},
});

const mocks = {
	...mockDatabase,
	table: mockDatabaseTable,
};

describe("store-sqlite", () => {
	tests(store, mocks);
	describe("makeSqlParts", () => {
		it("Should format {select} properly", async () => {
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

		it("Should format {select} to *", async () => {
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

		it("Should format {insert} properly", async () => {
			const filters = {};
			const values = { a: "a", b: "b" };

			store.default({ placeholder: "$" });
			const { insert, parameters } = store.makeSqlParts(filters, values);

			equal(insert, '("a", "b") VALUES ($1,$2)');
			deepEqual(parameters, ["a", "b"]);
		});

		it("Should format {update} properly", async () => {
			const filters = {};
			const values = { a: "a", b: "b" };

			store.default({ placeholder: "$" });
			const { update, parameters } = store.makeSqlParts(filters, values);

			equal(update, '"a" = $1, "b" = $2');
			deepEqual(parameters, ["a", "b"]);
		});

		it("Should format {where} properly", async () => {
			const filters = { a: "a", bc: ["b", "c"], d: "d" };

			store.default({ placeholder: "$" });
			const { where, parameters } = store.makeSqlParts(filters);

			equal(where, 'WHERE "a" = $1 AND "bc" IN ($2,$3) AND "d" = $4');
			deepEqual(parameters, ["a", "b", "c", "d"]);
		});
	});
});
