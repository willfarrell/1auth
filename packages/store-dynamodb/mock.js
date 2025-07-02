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
const waitForStart = async () => {
	if (ready) return;
	try {
		await storeClient.send(new ListTablesCommand());
		ready = 1;
	} catch (error) {
		console.info("Waiting for dynamodb to start...", error);
		await setTimeout(500);
		return waitForStart();
	}
};
await waitForStart();
