// Copyright 2003 - 2026 will Farrell, and 1Auth contributors.
// SPDX-License-Identifier: MIT
import { createSqlStore } from "@1auth/store-sql";

// Cloudflare D1 storage. D1 binds prepared statements rather than exposing
// `query(sql, parameters)`, so the adapter reads `.all()` into rows[].
const store = createSqlStore({
	id: "d1",
	query: (client, sql, parameters) =>
		client
			.prepare(sql)
			.bind(...parameters)
			.all()
			.then((res) => res.results),
});
export default store.default;
export const {
	exists,
	select,
	selectList,
	insert,
	insertList,
	update,
	remove,
	removeList,
	getPlaceholder,
	makeSqlParts,
} = store;

export {
	getPlaceholderFor,
	log,
	makeInsertList,
	makeSqlPartsFor,
	makeValues,
	normalizeValues,
	parseValues,
	withTimeToLive,
} from "@1auth/store-sql";
