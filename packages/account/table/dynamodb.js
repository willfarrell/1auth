// Copyright 2003 - 2026 will Farrell, and 1Auth contributors.
// SPDX-License-Identifier: MIT
import {
	CreateTableCommand,
	DeleteTableCommand,
} from "@aws-sdk/client-dynamodb";

export const name = "accounts";
export const timeToLiveKey = "remove";

export const create = async (client, table = name) => {
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
				TimeToLiveSpecification: {
					Enabled: true,
					AttributeName: timeToLiveKey,
				},
				BillingMode: "PAY_PER_REQUEST",
			}),
		);
	} catch (e) {
		if (e.message === "Cannot create preexisting table") {
			await truncate(client, table);
		} else {
			console.error("ERROR create", e.message);
			throw e;
		}
	}
};

export const truncate = async (client, table = name) => {
	await drop(client, table);
	await create(client, table);
};

export const drop = async (client, table = name) => {
	await client.send(
		new DeleteTableCommand({
			TableName: table,
		}),
	);
};
