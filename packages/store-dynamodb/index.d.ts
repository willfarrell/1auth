// Copyright 2003 - 2026 will Farrell, and 1Auth contributors.
// SPDX-License-Identifier: MIT
import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";

/** Attribute filters, an array value becomes `IN (...)`. */
export type Filters = Record<string, unknown>;
/** An unmarshalled item. */
export type Row = Record<string, any>;

export interface DynamoDBStoreOptions {
	id: string;
	log: ((...args: unknown[]) => void) | false;
	client: DynamoDBClient;
	/** Makes an `id` for `insert` when the values have none. */
	randomId: (() => unknown) | undefined;
	/** Seconds after `expire` before the item is removed. */
	timeToLiveExpireOffset: number;
	timeToLiveKey: string;
}

/** Resets to the defaults, then applies `opt`. */
declare function configure(opt?: Partial<DynamoDBStoreOptions>): void;
export default configure;

/** Resolves the `sub` of the matching item. */
export function exists(
	table: string,
	filters: Filters,
): Promise<string | undefined>;
export function select(
	table: string,
	filters?: Filters,
	fields?: string[],
): Promise<Row | undefined>;
export function selectList(
	table: string,
	filters?: Filters,
	fields?: string[],
): Promise<Row[]>;
/** Resolves the item's `id`. */
export function insert(table: string, values?: Row): Promise<unknown>;
/** At most 100 rows, written in one transaction. Resolves their `id`s. */
export function insertList(table: string, rows?: Row[]): Promise<unknown[]>;
export function update(
	table: string,
	filters?: Filters,
	values?: Row,
): Promise<void>;
/** Resolves whether an item was deleted. */
export function remove(table: string, filters?: Filters): Promise<boolean>;
export function removeList(table: string, filters?: Filters): Promise<void>;

export function makeQueryParams(filters?: Filters): {
	ExpressionAttributeNames: Record<string, string>;
	ExpressionAttributeValues: Record<string, unknown>;
	KeyConditionExpression: string;
	UpdateExpression: string;
};
