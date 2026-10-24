// Copyright 2003 - 2026 will Farrell, and 1Auth contributors.
// SPDX-License-Identifier: MIT
import type { RotatedSession, Row, SessionOptions } from "@1auth/session";

export interface DbscOptions {
	id: string;
	log: ((...args: unknown[]) => void) | false;
	/** Unbound sessions only live as long as the registration challenge. */
	require: boolean;
	/** Seconds a challenge stays valid. */
	challengeExpire: number;
	challengeTable: string;
	registerPath: string;
	refreshPath: string;
	sidCookieName: string;
	sidCookieAttributes: string;
	dbscCookieName: string;
	dbscCookieAttributes: string;
	/** Seconds, must be shorter than the session `expire`. */
	dbscCookieExpire: number;
	scope: { include_site?: boolean; [key: string]: unknown };
}

/** Response body of the registration and refresh endpoints. */
export interface DbscSessionConfig {
	session_identifier: string;
	refresh_url: string;
	scope: DbscOptions["scope"];
	credentials: { type: "cookie"; name: string; attributes: string }[];
}

export interface DbscProofOptions {
	/** URL the proof was sent to. */
	aud?: string;
	/** Sec-Secure-Session-Id header, absent on registration. */
	sessionId?: string;
	/** Stored JWK, required when `sessionId` is set. */
	publicKey?: string;
}

export interface DbscRequestOptions {
	/** URL the proof was sent to. */
	aud?: string;
	/** Device metadata, compared as `@1auth/session` does. */
	value?: unknown;
	values?: Row;
}

/** Options not owned by this module are forwarded to `@1auth/session`. Throws on unsafe cookie settings. */
declare function configure(
	opt?: Partial<DbscOptions> & Partial<SessionOptions>,
): void;
export default configure;

export function getOptions(): DbscOptions;

export function challenge(sessionId?: string): string;
export function boundToken(sessionId: string): string;
export function boundTokenVerify(value: unknown, sessionId: unknown): boolean;
/** Value of the header that starts a bound session. */
export function registrationHeader(options?: {
	authorization?: string;
}): string;
/** Throws `404 Not Found` when `sessionId` is not header safe. */
export function challengeHeader(sessionId: string): string;
export function sidCookieHeader(sid: string): string;
export function dbscCookieHeader(token: string): string;
/** Response body that ends the bound session. */
export function terminate(sessionId: string): {
	session_identifier: string;
	continue: false;
};

/** Throws `401 Unauthorized` or `403 Forbidden` when the proof does not verify. */
export function verifyProof(
	proof: unknown,
	options?: DbscProofOptions,
): Promise<{ publicKey: string; payload: Record<string, any> }>;

/**
 * Resolves the session for the request's cookies.
 * `bound` is the `dbscCookieName` cookie, absent until registration.
 */
export function lookup(
	sid: string,
	bound: string | undefined,
	value?: unknown,
): Promise<Row | undefined>;
export function select(sub: string, id: string): Promise<Row | undefined>;
export function list(sub: string): Promise<Row[]>;
/** Binds the proof's device key onto the session `sid` belongs to. */
export function register(
	sid: string,
	proof: string,
	options?: DbscRequestOptions,
): Promise<{
	id: string;
	session: RotatedSession;
	bound: string;
	config: DbscSessionConfig;
}>;
/** Proves possession of the bound key, resolves a new bound cookie value. */
export function refresh(
	sessionId: string,
	proof: string,
	options?: DbscRequestOptions,
): Promise<{ id: string; bound: string; config: DbscSessionConfig }>;
export function expire(sub: string, id: string): Promise<void>;
export function remove(sub: string, id: string): Promise<void>;
