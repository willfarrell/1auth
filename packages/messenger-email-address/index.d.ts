// Copyright 2003 - 2026 will Farrell, and 1Auth contributors.
// SPDX-License-Identifier: MIT
import type { CredentialOptions } from "@1auth/authn";
import type { RandomConfigOptions } from "@1auth/crypto";
import type { MessengerOptions, Row } from "@1auth/messenger";

/** `@1auth/messenger` token with the `emailAddress` id. */
export function token(params?: RandomConfigOptions): CredentialOptions;

/** Extends the `@1auth/messenger` options it is configured from. */
export interface EmailAddressOptions extends MessengerOptions {
	/** Domains where dots in the local part are ignored. */
	optionalDotDomains: string[];
	/** Maps an alias domain to its canonical domain. */
	aliasDomains: Record<string, string>;
	/** Local parts refused with `409 Conflict`. */
	usernameBlacklist: string[];
}

/** A validation failure message, e.g. `400 Bad Request` or `409 Conflict`. */
export type ValidationError = string;

/** Call after `@1auth/messenger` is configured, its options are copied in. */
declare function configure(opt?: Partial<EmailAddressOptions>): void;
export default configure;

export function exists(value: string): Promise<string | undefined>;
export function count(sub: string): Promise<number>;
export function lookup(emailAddress: string): Promise<Row | undefined>;
export function list(sub: string): Promise<Row[]>;
export function select(sub: string, id: string): Promise<Row | undefined>;
/** Throws the validation message when `value` is not a valid email address. */
export function create(
	sub: string,
	value: string,
	values?: Row,
): Promise<string | undefined>;
export function remove(sub: string, id: string): Promise<void>;
export function createToken(sub: string, sourceId: string): Promise<string>;
export function verifyToken(
	sub: string,
	token: string,
	sourceId: string,
): Promise<void>;

/** Canonical form used for the digest, throws `400 Bad Request` on non-strings. */
export function sanitize(value: unknown): string;
export function validate(value: string): true | ValidationError;
/** Returns e.g. `w...l@example.com`. */
export function mask(value: string): string;
