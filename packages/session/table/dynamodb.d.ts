// Copyright 2003 - 2026 will Farrell, and 1Auth contributors.
// SPDX-License-Identifier: MIT
import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";

export const name: string;
export const timeToLiveKey: string;
/** Drops any existing table, then waits until the new one is ACTIVE. */
export function create(
	client: DynamoDBClient,
	table?: string,
	/** `dbsc` (default true) adds the id only index @1auth/session-dbsc needs. */
	options?: { dbsc?: boolean },
): Promise<void>;
/** Deletes every item, keeps the table. */
export function truncate(client: DynamoDBClient, table?: string): Promise<void>;
export function drop(client: DynamoDBClient, table?: string): Promise<void>;
