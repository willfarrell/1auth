// Copyright 2003 - 2026 will Farrell, and 1Auth contributors.
// SPDX-License-Identifier: MIT
import type { AccountOptions, Notify, Row } from "@1auth/account";

/** Extends the `@1auth/account` options it is configured from. */
export interface AccountUsernameOptions extends AccountOptions {
	notify: Notify;
	/** Template id prefix, set per instance when running more than one. */
	notifyId: string;
	allowedCharRegExp: RegExp;
	usernameBlacklist: string[];
	minLength: number;
	maxLength: number;
}

/** A validation failure message, e.g. `400 Bad Request` or `409 Conflict`. */
export type ValidationError = string;

/** Call after `@1auth/account` is configured, its options are copied in. */
declare function configure(opt?: Partial<AccountUsernameOptions>): void;
export default configure;

export function getOptions(): AccountUsernameOptions;

/** Resolves the `sub` that holds `username`. */
export function exists(username: string): Promise<string | undefined>;
/** Resolves the decrypted account that holds `username`. */
export function lookup(username: string): Promise<Row | undefined>;
/** Throws `409 Conflict` when the username is taken. */
export function create(sub: string, username: string): Promise<void>;
export function update(sub: string, username: string): Promise<void>;
/** Sends the account's username to its owner. */
export function recover(sub: string): Promise<void>;

/** Trims, lower cases and strips diacritics, throws `400 Bad Request` on non-strings. */
export function sanitize(value: unknown): string;
export function validate(value: string): true | ValidationError;
export function validateLength(value: string): true | ValidationError;
export function validateAllowedChar(value: string): true | ValidationError;
export function validateBlacklist(value: string): true | ValidationError;
