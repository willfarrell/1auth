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

export interface SessionOptions {
	id: string;
	/** Template id prefix, set per instance when running more than one. */
	notifyId: string;
	log: ((...args: unknown[]) => void) | false;
	store: Store;
	notify: Notify;
	table: string;
	idGenerate: boolean;
	randomId: IdGenerator;
	randomSessionId: IdGenerator;
	/** Absolute lifetime in seconds. */
	expire: number;
	/** Idle lifetime in seconds, falsy turns it off. */
	idleExpire: number | false;
	/** Concurrent live sessions per `sub`, falsy turns the cap off. */
	limit: number | false;
	encryptedFields: string[];
	/** Serializes device metadata, the result is encrypted. */
	encode: (value: any) => string;
	decode: (value: string) => any;
	/** Compares stored and incoming encoded metadata. */
	checkMetadata: (oldSession: string, newSession: string) => boolean;
}

/** A newly created session. `sid` is only available here. */
export interface CreatedSession extends Row {
	id: string;
	sid: string;
	sub: string;
	digest: string;
	/** Wrapped row encryption key. */
	encryptionKey: string;
	create: number;
	update: number;
	expire: number;
}

/** A session after `rotate`, `id` and `expire` are unchanged. */
export interface RotatedSession extends Row {
	id: string;
	sid: string;
	sub: string;
	digest: string;
	encryptionKey: string;
	update: number;
}

/** Defaults to the `session_` prefix. */
export function randomId(params?: RandomConfigOptions): RandomConfigObject;
/** Defaults to the `sid_` prefix and 128 bits of entropy. */
export function randomSessionId(
	params?: RandomConfigOptions,
): RandomConfigObject;

declare function configure(opt?: Partial<SessionOptions>): void;
export default configure;

export function getOptions(): SessionOptions;

/** Resolves the live session for `sid` when the device metadata matches. */
export function lookup(sid: string, value?: unknown): Promise<Row | undefined>;
/** Resolves the session with its decrypted, decoded `value`. */
export function select(sub: string, id: string): Promise<Row | undefined>;
/** Only `id`, `sub`, `publicKey`, `create`, `update` and `expire`. */
export function selectBinding(id: string): Promise<Row | undefined>;
export function list(sub: string): Promise<Row[]>;
/** `value` is the device metadata, e.g. `{ os, browser, ip }`. */
export function create(
	sub: string,
	value: unknown,
	values?: Row,
): Promise<CreatedSession>;
/** Issues the next `sid` on an existing row, in place. */
export function rotate(
	sub: string,
	id: string,
	value: unknown,
	values?: Row,
): Promise<RotatedSession>;
/** Notifies `<notifyId>-new-device` when no live session has matching metadata. */
export function check(sub: string, value?: unknown): Promise<void>;
export function expire(sub: string, id: string): Promise<void>;
export function remove(sub: string, id: string): Promise<void>;
/** Returns `<sid>.<signature>`. */
export function sign(sid: string): string;
/** Returns the `sid`, or `false` when the signature does not match. */
export function verify(sidWithSignature: unknown): string | false;
