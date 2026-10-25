// Copyright 2003 - 2026 will Farrell, and 1Auth contributors.
// SPDX-License-Identifier: MIT
import type {
	CredentialOptions,
	IdGenerator,
	Notify,
	Row,
	Store,
} from "@1auth/authn";
import type { RandomConfigObject, RandomConfigOptions } from "@1auth/crypto";

export type { Notify, Row, Store } from "@1auth/authn";

export interface MessengerOptions {
	id: string;
	/** Template id prefix, set per instance when running more than one. */
	notifyId: string;
	store: Store;
	notify: Notify;
	table: string;
	idGenerate: boolean;
	randomId: IdGenerator;
	token: CredentialOptions;
	encryptedFields: string[];
}

/** Defaults to the `messenger_` prefix. */
export function randomId(params?: RandomConfigOptions): RandomConfigObject;
/** One time 6 digit code, hashed with argon2, expiring after 10 minutes by default. */
export function token(params?: RandomConfigOptions): CredentialOptions;

declare function configure(opt?: Partial<MessengerOptions>): void;
export default configure;

export function getOptions(): MessengerOptions;

/** Resolves the `sub` with a verified messenger of this value. */
export function exists(
	type: string,
	value: string,
): Promise<string | undefined>;
/** Counts verified messengers that have not expired. */
export function count(type: string, sub: string): Promise<number>;
/** Resolves the decrypted verified messenger of this value. */
export function lookup(type: string, value: string): Promise<Row | undefined>;
export function list(type: string, sub: string): Promise<Row[]>;
/** Resolves only a verified messenger. */
export function select(
	type: string,
	sub: string,
	id: string,
): Promise<Row | undefined>;
/** Resolves the messenger `id`, or `undefined` when another account already verified the value. */
export function create(
	type: string,
	sub: string,
	values: Row & { digest: string },
): Promise<string | undefined>;
/** Replaces any previous token and sends the new one, resolves its `id`. */
export function createToken(
	type: string,
	sub: string,
	sourceId: string,
): Promise<string>;
export function verifyToken(
	type: string,
	sub: string,
	token: string,
	sourceId: string,
): Promise<void>;
export function remove(type: string, sub: string, id: string): Promise<void>;
