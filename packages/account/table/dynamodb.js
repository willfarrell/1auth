// Copyright 2003 - 2026 will Farrell, and 1Auth contributors.
// SPDX-License-Identifier: MIT
import { setTimeout } from "node:timers/promises";
import {
	BatchWriteItemCommand,
	CreateTableCommand,
	DeleteTableCommand,
	DescribeTableCommand,
	ScanCommand,
	UpdateTimeToLiveCommand,
	waitUntilTableExists,
	waitUntilTableNotExists,
} from "@aws-sdk/client-dynamodb";

export const name = "accounts";
export const timeToLiveKey = "remove";
const keyAttributes = ["sub"];

// A table and its GSIs are created asynchronously. Querying one before it is
// ACTIVE fails with ResourceNotFoundException, which is what made this suite
// flaky by the tens of failures per run.
const ready = async (client, table) => {
	await waitUntilTableExists({ client, maxWaitTime: 30 }, { TableName: table });
	for (let i = 0; i < 100; i++) {
		try {
			const { Table } = await client.send(
				new DescribeTableCommand({ TableName: table }),
			);
			const indexes = Table.GlobalSecondaryIndexes ?? [];
			if (
				Table.TableStatus === "ACTIVE" &&
				indexes.every((index) => index.IndexStatus === "ACTIVE")
			) {
				return;
			}
		} catch (e) {
			// dynamodb-local briefly reports a just-created table as missing
			if (e.name !== "ResourceNotFoundException") throw e;
		}
		await setTimeout(50);
	}
	// Carry the last status out: a bare timeout here tells you nothing, and the
	// failures this waiter exists to prevent are intermittent enough that a
	// recurrence has to explain itself the first time it happens.
	const { Table } = await client.send(
		new DescribeTableCommand({ TableName: table }),
	);
	throw new Error(`${table} did not become ACTIVE`, {
		cause: {
			TableStatus: Table?.TableStatus,
			indexes: (Table?.GlobalSecondaryIndexes ?? []).map((index) => [
				index.IndexName,
				index.IndexStatus,
			]),
		},
	});
};

export const create = async (client, table = name) => {
	// The container is persistent and keeps leftover tables from killed runs. A
	// stale schema fails an entire run at once, so start from a clean slate.
	await drop(client, table);
	try {
		await client.send(
			new CreateTableCommand({
				TableName: table,
				AttributeDefinitions: [
					// {
					// 	AttributeName: "id",
					// 	AttributeType: "S",
					// },
					{
						AttributeName: "sub",
						AttributeType: "S",
					},
					{
						AttributeName: "digest",
						AttributeType: "S",
					},
					// Used for listing all active sessions (optional)
					// {
					// 	AttributeName: "expire",
					// 	AttributeType: "N",
					// },
				],
				KeySchema: [
					{
						AttributeName: "sub",
						KeyType: "HASH",
					},
					// {
					// 	AttributeName: "id",
					// 	KeyType: "RANGE",
					// },
				],
				GlobalSecondaryIndexes: [
					{
						IndexName: "sub",
						KeySchema: [
							{
								AttributeName: "sub",
								KeyType: "HASH",
							},
						],
						Projection: {
							ProjectionType: "INCLUDE",
							NonKeyAttributes: [
								"id",
								"encryptionKey",
								"value",
								"name", // optional, used in tests
								"unencrypted", // optional, used in tests
								"create",
								"expire",
							],
						},
					},
					{
						IndexName: "digest",
						KeySchema: [
							{
								AttributeName: "digest",
								KeyType: "HASH",
							},
						],
						Projection: {
							ProjectionType: "INCLUDE",
							NonKeyAttributes: [
								"id",
								"sub",
								"encryptionKey",
								"value",
								"create",
								"expire",
							],
						},
					},
					// Used for listing all (optional)
					// {
					// 	IndexName: "active",
					// 	KeySchema: [
					// 		{
					// 			AttributeName: "expire",
					// 			KeyType: "HASH",
					// 		},
					// 	],
					// 	Projection: {
					// 		ProjectionType: "INCLUDE",
					// 		NonKeyAttributes: ["sub", "create"],
					// 	},
					// },
				],
				BillingMode: "PAY_PER_REQUEST",
			}),
		);
	} catch (e) {
		console.error("ERROR create", e.message);
		throw e;
	}
	await ready(client, table);
	// Real DynamoDB rejects TimeToLiveSpecification inside CreateTable, it is a
	// separate call. dynamodb-local tolerated it, so this file never worked
	// against AWS.
	await client.send(
		new UpdateTimeToLiveCommand({
			TableName: table,
			TimeToLiveSpecification: {
				Enabled: true,
				AttributeName: timeToLiveKey,
			},
		}),
	);
};

// Delete the rows, never the table. Dropping and recreating a table plus its
// GSIs on every afterEach is what made this suite unusable.
export const truncate = async (client, table = name) => {
	let ExclusiveStartKey;
	do {
		const res = await client.send(
			new ScanCommand({
				TableName: table,
				// Strongly consistent: a default Scan can miss rows written moments
				// ago, leaving them behind for the next test to trip over.
				ConsistentRead: true,
				ProjectionExpression: keyAttributes.map((k) => `#${k}`).join(", "),
				ExpressionAttributeNames: Object.fromEntries(
					keyAttributes.map((k) => [`#${k}`, k]),
				),
				ExclusiveStartKey,
			}),
		);
		// Scan returns keys already marshalled, which is what DeleteRequest wants
		for (let i = 0; i < res.Items.length; i += 25) {
			await client.send(
				new BatchWriteItemCommand({
					RequestItems: {
						[table]: res.Items.slice(i, i + 25).map((Key) => ({
							DeleteRequest: { Key },
						})),
					},
				}),
			);
		}
		ExclusiveStartKey = res.LastEvaluatedKey;
	} while (ExclusiveStartKey);
};

export const drop = async (client, table = name) => {
	try {
		await client.send(
			new DeleteTableCommand({
				TableName: table,
			}),
		);
		// Deletion is asynchronous. Recreating before it finishes yields either
		// ResourceInUseException or a table that vanishes mid-test, which is what
		// made whole runs fail at once rather than a test here and there.
		await waitUntilTableNotExists(
			{ client, maxWaitTime: 30 },
			{ TableName: table },
		);
	} catch (e) {
		if (e.name !== "ResourceNotFoundException") {
			throw e;
		}
	}
};
