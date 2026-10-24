// Copyright 2003 - 2026 will Farrell, and 1Auth contributors.
// SPDX-License-Identifier: MIT
export interface D1TableClient {
	prepare(sql: string): { run(): unknown };
}

export const name: string;
export const timeToLiveKey: string;
/** Resolves whatever the prepared statement's `run()` returns. */
export function create(client: D1TableClient, table?: string): Promise<unknown>;
export function truncate(
	client: D1TableClient,
	table?: string,
): Promise<unknown>;
export function drop(client: D1TableClient, table?: string): Promise<unknown>;
/** A row with every column set to its empty value. */
export function emptyRow(): Record<string, unknown>;
