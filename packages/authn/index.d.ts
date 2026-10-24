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

/** Resolves the `sub` that owns `username`, if any. */
export type UsernameExists = (
	username: string,
) => string | undefined | Promise<string | undefined>;

/** Describes one kind of credential, built with `makeRandomConfigObject`. */
export interface CredentialOptions {
	id: string | undefined;
	type: string;
	/** One time use, removed once it verifies. */
	otp?: boolean;
	/** Seconds from creation until it expires. */
	expire?: number;
	/** Makes a new secret value when none is given. */
	create(): any;
	/** May be async. */
	encode(value: any): unknown;
	/** May be async. */
	decode(value: any): unknown;
	/** Truthy when `input` matches the decoded `value`, may be async. */
	verify(
		input: any,
		value: any,
		values?: Row,
		credentialParams?: Record<string, any>,
	): unknown;
	/** Runs after a successful `authenticate`. */
	cleanup?(sub: string, value: any, values: Row): unknown;
	/** Narrows `authenticate` to credentials with this digest. */
	digest?: string;
	/** Narrows `verify` to credentials from this source. */
	sourceId?: string;
	[key: string]: unknown;
}

/** The values written for a new credential. */
export interface CredentialValues extends Row {
	sub: string;
	type: string;
	otp: boolean | undefined;
	/** Wrapped row encryption key. */
	encryptionKey: string;
	create: number;
	update: number;
	expire?: number;
}

/** A stored credential row. Ids are strings, `assertId` rejects anything else. */
export interface Credential extends CredentialValues {
	id: string;
}

export interface AuthnOptions {
	id: string;
	log: ((...args: unknown[]) => void) | false;
	store: Store;
	notify: Notify | undefined;
	table: string;
	idGenerate: boolean;
	randomId: IdGenerator;
	/** Minimum time `authenticate` and `verify` take, in ms. */
	authenticationDuration: number;
	otpMaxAttempts: number;
	/** Hooks that resolve a username to a `sub`. */
	usernameExists: UsernameExists[];
	encryptedFields: string[];
}

/** Defaults to the `authn_` prefix. */
export function randomId(params?: RandomConfigOptions): RandomConfigObject;

declare function configure(opt?: Partial<AuthnOptions>): void;
export default configure;

export function getOptions(): AuthnOptions;

/** Counts verified credentials that have not expired. */
export function count(
	credentialOptions: CredentialOptions,
	sub: string,
): Promise<number>;
/** Decrypted credentials that have not expired. */
export function list(
	credentialOptions: CredentialOptions,
	sub: string,
	params?: Filters,
	fields?: string[],
): Promise<Row[]>;
export function create(
	credentialOptions: CredentialOptions,
	sub: string,
	values: Row,
): Promise<Credential>;
/** Resolves one id per row in `list`, each usable with `select` and `remove`. */
export function createList(
	credentialOptions: CredentialOptions,
	sub: string,
	list: Row[],
): Promise<string[]>;
/** Re-encodes and stores `value`, used by WebAuthn to update its counter. */
export function update(
	credentialOptions: CredentialOptions,
	values: Row & {
		id: string;
		sub: string;
		encryptionKey?: unknown;
		encryptedKey?: string;
		value: unknown;
	},
): Promise<void>;
/** Resolves the first `sub` any `usernameExists` hook returns. */
export function subject(username: string): Promise<string | undefined>;
/** Resolves `sub`, throws `401 Unauthorized` when no credential verifies. */
export function authenticate(
	credentialOptions: CredentialOptions,
	username: string,
	secret: unknown,
	credentialParams?: Record<string, any>,
): Promise<string>;
export function verifySecret(
	credentialOptions: CredentialOptions,
	sub: string,
	id: string,
): Promise<void>;
/** Resolves the matching credential merged with what `verify` returned. */
export function verify(
	credentialOptions: CredentialOptions,
	sub: string,
	input: unknown,
): Promise<Row>;
export function expire(
	credentialOptions: CredentialOptions,
	sub: string,
	id: string,
	values?: Row,
): Promise<void>;
/** Resolves whether a credential was removed. */
export function remove(
	credentialOptions: CredentialOptions,
	sub: string,
	id: string,
): Promise<boolean>;
export function removeList(
	credentialOptions: CredentialOptions,
	sub: string,
	id: string[],
): Promise<void>;
export function select(
	credentialOptions: CredentialOptions,
	sub: string,
	id: string,
): Promise<Row | undefined>;
/** Returns `<id>-<type>`. */
export function makeType(
	credentialOptions: Pick<CredentialOptions, "id" | "type">,
): string;
