// Copyright 2003 - 2026 will Farrell, and 1Auth contributors.
// SPDX-License-Identifier: MIT
import { Bench } from "tinybench";

import notify, { trigger } from "./index.js";

notify({ client: async () => {} });

const suite = new Bench({ name: "@1auth/notify" });

suite
	.add("trigger with minimal args", async () => {
		await trigger("template-1", "user-123");
	})
	.add("trigger with full args", async () => {
		await trigger(
			"template-1",
			"user-123",
			{ token: "abc123", username: "john" },
			{
				messengers: [{ type: "email", value: "test@test.com" }],
				types: ["email"],
			},
		);
	});

await suite.run();

console.table(suite.table());

const failed = suite.tasks.filter((task) => task.result?.error);
if (failed.length) {
	throw new AggregateError(
		failed.map((task) => task.result.error),
		`${failed.length} benchmark(s) errored`,
	);
}
