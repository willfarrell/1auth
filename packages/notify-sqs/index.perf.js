// Copyright 2003 - 2026 will Farrell, and 1Auth contributors.
// SPDX-License-Identifier: MIT
import { Bench } from "tinybench";

import notifySqs, { trigger } from "./index.js";

const mockClient = { send: async () => ({}) };
notifySqs({
	client: mockClient,
	queueUrl: "https://sqs.us-east-1.amazonaws.com/123/test-queue",
});

const suite = new Bench({ name: "@1auth/notify-sqs" });

suite
	.add("trigger with minimal args", async () => {
		await trigger("template-1", "user-123");
	})
	.add("trigger with full args", async () => {
		await trigger(
			"template-1",
			"user-123",
			{ token: "abc123" },
			{ messengers: [{ type: "email", value: "test@test.com" }] },
		);
	});

suite.addEventListener("complete", () => {
	console.table(suite.table());
});

suite.run();
