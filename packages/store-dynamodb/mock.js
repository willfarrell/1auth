// Copyright 2003 - 2026 will Farrell, and 1Auth contributors.
// SPDX-License-Identifier: MIT
import { setTimeout } from "node:timers/promises";
import { DynamoDBClient, ListTablesCommand } from "@aws-sdk/client-dynamodb";

export const log = () => {};
export const storeClient = new DynamoDBClient({
	endpoint: "http://localhost:8000",
	region: "ca-central-1",
	credentials: {
		accessKeyId: "test",
		secretAccessKey: "secret",
	},
	maxRetries: 10,
});

let ready;
const maxRetries = 30;
const waitForStart = async (attempt = 0) => {
	if (ready) return;
	try {
		await storeClient.send(new ListTablesCommand());
		ready = 1;
	} catch (error) {
		if (attempt >= maxRetries) {
			// Warning and continuing silently dropped 225 tests from a full run
			// while it still reported green, so a missing container has to be
			// loud. Skipping is fine, but it has to be a decision.
			if (process.env.SKIP_DYNAMODB) {
				console.warn(
					"DynamoDB local not available, SKIP_DYNAMODB set, skipping DynamoDB tests",
				);
				return;
			}
			throw new Error(
				"DynamoDB local not available on http://localhost:8000. Start it with `npm run test:dynamodb`, or set SKIP_DYNAMODB=1 to skip these tests deliberately.",
				{ cause: error },
			);
		}
		console.info("Waiting for dynamodb to start...", error);
		await setTimeout(500);
		return waitForStart(attempt + 1);
	}
};
await waitForStart();

export const isReady = () => !!ready;
