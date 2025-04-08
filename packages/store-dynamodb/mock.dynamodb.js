import { setTimeout } from "node:timers/promises";
import { DynamoDBClient, ListTablesCommand } from "@aws-sdk/client-dynamodb";

// const defaults = {
//   log: true,
// };
// const options = {};
// export default (opt = {}) => {
//   Object.assign(options, defaults, opt);
// };
export const log = console.log;
export const client = new DynamoDBClient({
	endpoint: "http://localhost:8000",
	region: "ca-central-1",
	credentials: {
		accessKeyId: "test",
		secretAccessKey: "secret",
	},
	maxRetries: 10,
});

const waitForStart = async () => {
	try {
		await client.send(new ListTablesCommand());
	} catch (error) {
		console.log("Waiting for Docker container to start...", error);
		await setTimeout(500);
		return waitForStart();
	}
};
await waitForStart();
