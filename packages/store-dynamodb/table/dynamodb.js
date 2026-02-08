// Copyright 2003 - 2026 will Farrell, and 1Auth contributors.
// SPDX-License-Identifier: MIT
import {
	CreateTableCommand,
	DeleteTableCommand,
} from "@aws-sdk/client-dynamodb";

export const name = "test";
export const timeToLiveKey = "remove";

export const create = async (client, table = name) => {
	try {
		await client.send(
			new CreateTableCommand({
				TableName: table,
				AttributeDefinitions: [
					{
						AttributeName: "id",
						AttributeType: "N",
					},
					{
						AttributeName: "sub",
						AttributeType: "S",
					},
					{
						AttributeName: "digest", // account-username & session
						AttributeType: "S",
					},
					// {
					//   AttributeName: "expire",
					//   AttributeType: "N",
					// },
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
						IndexName: "key",
						KeySchema: [
							{
								AttributeName: "id",
								KeyType: "HASH",
							},
						],
						Projection: {
							ProjectionType: "INCLUDE",
							NonKeyAttributes: ["value", "create", "expire"],
						},
					},
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
							NonKeyAttributes: ["value", "create", "expire"],
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
							NonKeyAttributes: ["value", "create", "expire"],
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

export const emptyRow = () => ({
	sub: null,
	value: null,
});
