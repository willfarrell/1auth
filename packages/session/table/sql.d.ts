// Copyright 2003 - 2026 will Farrell, and 1Auth contributors.
// SPDX-License-Identifier: MIT
export interface SqlTableClient {
	query(sql: string): unknown;
}

export const name: string;
export const timeToLiveKey: string;
/** Resolves whatever the last `client.query` returns. */
export function create(
	client: SqlTableClient,
	table?: string,
): Promise<unknown>;
export function truncate(
	client: SqlTableClient,
	table?: string,
): Promise<unknown>;
export function drop(client: SqlTableClient, table?: string): Promise<unknown>;
