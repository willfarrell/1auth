// Copyright 2003 - 2026 will Farrell, and 1Auth contributors.
// SPDX-License-Identifier: MIT
import type { SqlStore } from "@1auth/store-sql";

export type { Filters, Row, SqlStoreOptions } from "@1auth/store-sql";
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

/** `client` is a `pg` Pool or Client, its `query` resolves `{ rows }`, placeholders are `$1`. */
declare const configure: SqlStore["default"];
export default configure;
export const exists: SqlStore["exists"];
export const select: SqlStore["select"];
export const selectList: SqlStore["selectList"];
export const insert: SqlStore["insert"];
export const insertList: SqlStore["insertList"];
export const update: SqlStore["update"];
export const remove: SqlStore["remove"];
export const removeList: SqlStore["removeList"];
export const getPlaceholder: SqlStore["getPlaceholder"];
export const makeSqlParts: SqlStore["makeSqlParts"];
