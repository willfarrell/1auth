import { deepEqual, equal } from "node:assert/strict";
import { randomInt } from "node:crypto";
import { describe, it } from "node:test";
import * as store from "../store-dynamodb/index.js";

import * as mockDatabase from "./mock.js";
import * as mockDatabaseTable from "./table/dynamodb.js";

// import {
// 	DynamoDBClient, GetItemCommand
// } from "@aws-sdk/client-dynamodb";
// import { mockClient } from "aws-sdk-client-mock";

import tests from "../store/index.test.js";

store.default({
	log: (...args) => mocks.log(...args),
	client: {
		send: (...args) => mocks.storeClient.send(...args),
	},
	randomId: () => randomInt(281_474_976_710_655),
});

const mocks = {
	...mockDatabase,
	table: mockDatabaseTable,
};

describe("store-dynamodb", () => {
	tests(store, mocks);

	describe("makeQueryParams", () => {
		it("Should format {ExpressionAttributeNames} properly", async () => {
			const { ExpressionAttributeNames } = store.makeQueryParams(
				{ id: [1, 2], sub: "sub_000" },
				//["value"],
			);
			deepEqual(ExpressionAttributeNames, {
				"#id": "id",
				"#sub": "sub",
				//"#value": "value",
			});
		});
		it("Should format {ExpressionAttributeValues} properly", async () => {
			const { ExpressionAttributeValues } = store.makeQueryParams(
				{ id: [1, 2], sub: "sub_000" },
				["value"],
			);
			deepEqual(ExpressionAttributeValues, {
				":id": {
					NS: ["1", "2"],
				},
				":sub": {
					S: "sub_000",
				},
			});
		});
		it("Should format {KeyConditionExpression} properly", async () => {
			const { KeyConditionExpression } = store.makeQueryParams(
				{ id: [1, 2], sub: "sub_000" },
				["value"],
			);
			equal(KeyConditionExpression, "#id IN (:id) and #sub = :sub");
		});
		it("Should format {UpdateExpression} properly", async () => {
			const { UpdateExpression } = store.makeQueryParams(
				{ id: [1, 2], sub: "sub_000" },
				["value"],
			);
			equal(UpdateExpression, "SET #id = :id, #sub = :sub");
		});
	});
});
