// Copyright 2003 - 2026 will Farrell, and 1Auth contributors.
// SPDX-License-Identifier: MIT

/** Column filters, an array value becomes `IN (...)`. */
export type Filters = Record<string, unknown>;
/** A row as the client returns it, with timestamps parsed back to seconds. */
export type Row = Record<string, any>;
/** `$` gives numbered placeholders (`$1`), anything else is used as is. */
export type Placeholder = string;

export interface SqlStoreOptions {
	id: string | undefined;
	log: ((...args: unknown[]) => void) | false | undefined;
	/** Passed as the first argument to `query`. */
	client: unknown;
	/** Seconds after `expire` before the row is removed. */
	timeToLiveExpireOffset: number;
	timeToLiveKey: string;
	placeholder: Placeholder;
}

export type SqlQuery = (
	client: any,
	sql: string,
	parameters: unknown[],
) => Promise<Row[]> | Row[];

export interface SqlParts {
	select: string;
	insert: string;
	update: string;
	where: string;
	parameters: unknown[];
}

export interface SqlStore {
	default: (opt?: Partial<SqlStoreOptions>) => void;
	/** Resolves the `sub` of the first matching row. */
	exists: (table: string, filters: Filters) => Promise<string | undefined>;
	select: (
		table: string,
		filters?: Filters,
		fields?: string[],
	) => Promise<Row | undefined>;
	selectList: (
		table: string,
		filters?: Filters,
		fields?: string[],
	) => Promise<Row[]>;
	/** Resolves the inserted row's `id`. */
	insert: (table: string, values?: Row) => Promise<unknown>;
	/** Resolves the `RETURNING id` rows. */
	insertList: (table: string, rows?: Row[]) => Promise<Row[]>;
	update: (table: string, filters?: Filters, values?: Row) => Promise<void>;
	/** Resolves whether a row was deleted. */
	remove: (table: string, filters?: Filters) => Promise<boolean>;
	removeList: (table: string, filters?: Filters) => Promise<boolean>;
	getPlaceholder: (idx: number) => string;
	makeSqlParts: (
		filters?: Filters,
		values?: Row,
		fields?: string[],
		idxStart?: number,
	) => SqlParts;
}

export function createSqlStore(params: {
	id?: string;
	placeholder?: Placeholder;
	query?: SqlQuery;
}): SqlStore;

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

// --- builders --- //
export function log(
	options: Pick<SqlStoreOptions, "id" | "log">,
	method: string,
	...args: unknown[]
): void;

export function getPlaceholderFor(
	placeholder: Placeholder,
	idx: number,
): string;

export function makeSqlPartsFor(
	placeholder: Placeholder,
	filters?: Filters,
	values?: Row,
	fields?: string[],
	idxStart?: number,
): SqlParts;

export function makeInsertList(
	placeholder: Placeholder,
	valuesList: Row[],
): { insert: string; parameters: unknown[] };

/** Sets `timeToLiveKey` from `expire` when unset, mutates `values`. */
export function withTimeToLive<T extends Row>(
	values: T,
	options: Pick<SqlStoreOptions, "timeToLiveKey" | "timeToLiveExpireOffset">,
): T;

/** Clone of `inputValues` with time to live applied and values normalized. */
export function makeValues(
	inputValues: Row,
	options: Pick<SqlStoreOptions, "timeToLiveKey" | "timeToLiveExpireOffset">,
): Row;

/** Converts values to column types in place. */
export function normalizeValues(values: Row | null | undefined): void;

/** Converts column values back in place. */
export function parseValues(values: Row | null | undefined): void;
