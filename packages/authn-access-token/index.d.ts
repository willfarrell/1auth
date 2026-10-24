// Copyright 2003 - 2026 will Farrell, and 1Auth contributors.
// SPDX-License-Identifier: MIT
import type {
	AuthnOptions,
	CredentialOptions,
	IdGenerator,
	Notify,
	Row,
} from "@1auth/authn";
import type { RandomConfigObject, RandomConfigOptions } from "@1auth/crypto";

/** Public half of the token, `pat-` prefix and 128 bits of entropy by default. */
export function username(params?: RandomConfigOptions): RandomConfigObject;
/** Secret half, hashed with argon2 and expiring after 30 days by default. */
export function secret(params?: RandomConfigOptions): CredentialOptions;

/** Extends the `@1auth/authn` options it is configured from. */
export interface AccessTokenOptions extends AuthnOptions {
	notify: Notify;
	/** Template id prefix, set per instance when running more than one. */
	notifyId: string;
	username: IdGenerator;
	secret: CredentialOptions;
}

/** Call after `@1auth/authn` is configured, its options are copied in. */
declare function configure(opt?: Partial<AccessTokenOptions>): void;
export default configure;

/** Resolves `sub`, throws `401 Unauthorized` when the token does not verify. */
export function authenticate(username: string, secret: string): Promise<string>;
export function exists(username: string): Promise<string | undefined>;
export function count(sub: string): Promise<number>;
/** Resolves the stored token row while it has not expired. */
export function lookup(username: string): Promise<Row | undefined>;
export function select(sub: string, id: string): Promise<Row | undefined>;
export function list(sub: string): Promise<Row[]>;
/** `secret` is only available here, it is stored hashed. */
export function create(
	sub: string,
	values?: Row,
): Promise<{ id: string; username: string; secret: string }>;
export function expire(sub: string, id: string): Promise<void>;
export function remove(sub: string, id: string): Promise<void>;
