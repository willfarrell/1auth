// Copyright 2003 - 2026 will Farrell, and 1Auth contributors.
// SPDX-License-Identifier: MIT
import type { RandomConfigObject, RandomConfigOptions } from "@1auth/crypto";

export type Filters = Record<string, unknown>;
export type Row = Record<string, any>;

/** What every `@1auth/store-*` module provides. */
export interface Store {
	exists(table: string, filters: Filters): Promise<string | undefined>;
	select(
		table: string,
		filters?: Filters,
		fields?: string[],
	): Promise<Row | undefined>;
	selectList(
		table: string,
		filters?: Filters,
		fields?: string[],
	): Promise<Row[]>;
	insert(table: string, values?: Row): Promise<unknown>;
	insertList(table: string, rows?: Row[]): Promise<unknown>;
	update(table: string, filters?: Filters, values?: Row): Promise<void>;
	remove(table: string, filters?: Filters): Promise<boolean>;
	removeList(table: string, filters?: Filters): Promise<unknown>;
}

/** What every `@1auth/notify*` module provides. */
export interface Notify {
	trigger(
		id: string,
		sub: string,
		data?: Record<string, unknown>,
		notifyOptions?: Record<string, unknown>,
	): Promise<void>;
}

export interface IdGenerator {
	create(): string | Promise<string>;
}

export interface AccountOptions {
	id: string;
	store: Store;
	notify: Notify | undefined;
	table: string;
	idGenerate: boolean;
	randomId: IdGenerator;
	randomSubject: IdGenerator;
	encryptedFields: string[];
	/** Seconds between `remove()` and the row being hard deleted. */
	removeExpireOffset: number;
}

/** Defaults to the `user_` prefix. */
export function randomId(params?: RandomConfigOptions): RandomConfigObject;
/** Defaults to the `sub_` prefix. */
export function randomSubject(params?: RandomConfigOptions): RandomConfigObject;

declare function configure(opt?: Partial<AccountOptions>): void;
export default configure;

export function getOptions(): AccountOptions;

/** Resolves `sub` while the account exists and has not expired. */
export function exists(sub: string): Promise<string | undefined>;
/** Resolves the decrypted account, throws `404 Not Found` when missing or expired. */
export function lookup(sub: string): Promise<Row>;
/** Resolves the new account's `sub`. */
export function create(values?: Row): Promise<string>;
/** Updates in the clear metadata, owned keys are dropped. */
export function update(sub: string, values?: Row): Promise<void>;
export function updateIdentifier(
	sub: string,
	identifier: { value?: string; digest?: string },
): Promise<void>;
export function expire(sub: string): Promise<void>;
/** Expires now and schedules removal after `removeExpireOffset`. */
export function remove(sub: string): Promise<void>;
