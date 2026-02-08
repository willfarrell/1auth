// Copyright 2003 - 2026 will Farrell, and 1Auth contributors.
// SPDX-License-Identifier: MIT
import {
	CreateTableCommand,
	DeleteTableCommand,
} from "@aws-sdk/client-dynamodb";

export const name = "authentications";
export const timeToLiveKey = "remove";

export const create = async (client, table = name) => {
	try {
		await client.send(
			new CreateTableCommand({
				TableName: table,
				AttributeDefinitions: [
					{
						AttributeName: "id",
						AttributeType: "S",
					},
					{
						AttributeName: "sub",
						AttributeType: "S",
					},
					{
						AttributeName: "type",
						AttributeType: "S",
					},
					{
						AttributeName: "expire",
						AttributeType: "N",
					},
				],
				KeySchema: [
					{
						AttributeName: "sub",
						KeyType: "HASH",
					},
					{
						AttributeName: "id",
						KeyType: "RANGE",
					},
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
								"name",
								"create",
								"verify",
								"expire",
								"lastused",
							],
						},
					},
					{
						IndexName: "expire",
						KeySchema: [
							{
								AttributeName: "type",
								KeyType: "HASH",
							},
							{
								AttributeName: "expire",
								KeyType: "RANGE",
							},
						],
						Projection: {
							ProjectionType: "INCLUDE",
							NonKeyAttributes: ["sub"],
						},
					},
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
