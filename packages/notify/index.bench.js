// Copyright 2003 - 2026 will Farrell, and 1Auth contributors.
// SPDX-License-Identifier: MIT
import { bench, suite } from "node:bench";

import notify, { trigger } from "./index.js";

notify({ client: async () => {} });

suite("@1auth/notify", () => {
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
				{ token: "abc123", username: "john" },
				{
					messengers: [{ type: "email", value: "test@test.com" }],
					types: ["email"],
				},
			);
		}
		b.end(ops);
	});
});
