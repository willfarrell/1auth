// Copyright 2003 - 2026 will Farrell, and 1Auth contributors.
// SPDX-License-Identifier: MIT
import { bench, suite } from "node:bench";

import notifySqs, { trigger } from "./index.js";

const mockClient = { send: async () => ({}) };
notifySqs({
	client: mockClient,
	queueUrl: "https://sqs.us-east-1.amazonaws.com/123/test-queue",
});

suite("@1auth/notify-sqs", () => {
	bench(
		"trigger with minimal args",
		{ warmup: 100, samples: 30 },
		async (b) => {
			const ops = 1_000;
			b.start();
			for (let i = 0; i < ops; i++) {
				await trigger("template-1", "user-123");
			}
			b.end(ops);
		},
	);
	bench("trigger with full args", { warmup: 100, samples: 30 }, async (b) => {
		const ops = 1_000;
		b.start();
		for (let i = 0; i < ops; i++) {
			await trigger(
				"template-1",
				"user-123",
				{ token: "abc123" },
				{ messengers: [{ type: "email", value: "test@test.com" }] },
			);
		}
		b.end(ops);
	});
	bench(
		"trigger with log, data redacted",
		{ warmup: 100, samples: 30 },
		async (b) => {
			const ops = 1_000;
			b.start();
			for (let i = 0; i < ops; i++) {
				notifySqs({
					client: mockClient,
					queueUrl: "https://sqs.us-east-1.amazonaws.com/123/test-queue",
					log: () => {},
				});
				await trigger("template-1", "user-123", { token: "abc123" });
			}
			b.end(ops);
		},
	);
});
