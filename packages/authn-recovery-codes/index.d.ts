// Copyright 2003 - 2026 will Farrell, and 1Auth contributors.
// SPDX-License-Identifier: MIT
import type {
	AuthnOptions,
	CredentialOptions,
	Notify,
	Row,
} from "@1auth/authn";
import type { RandomConfigOptions } from "@1auth/crypto";

/** One time use, hashed with argon2, 128 bits of entropy by default. */
export function secret(params?: RandomConfigOptions): CredentialOptions;

/** Extends the `@1auth/authn` options it is configured from. */
export interface RecoveryCodesOptions extends AuthnOptions {
	notify: Notify;
	/** Template id prefix, set per instance when running more than one. */
	notifyId: string;
	secret: CredentialOptions;
	/** Codes made per `create` or `update`. */
	count: number;
}

/** A plain text recovery code, only available when created. */
export interface RecoveryCode {
	value: string;
	verify: number;
}

/** Call after `@1auth/authn` is configured, its options are copied in. */
declare function configure(opt?: Partial<RecoveryCodesOptions>): void;
export default configure;

/** Resolves `sub`, the matching code is consumed. */
export function authenticate(username: string, secret: string): Promise<string>;
export function count(sub: string): Promise<number>;
export function list(sub: string): Promise<Row[]>;
export function create(sub: string): Promise<RecoveryCode[]>;
/** Replaces every existing code with a new set. */
export function update(sub: string): Promise<RecoveryCode[]>;
/** Removes one code, or every code when `id` is not given. */
export function remove(sub: string, id?: string): Promise<void>;
