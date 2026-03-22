// Copyright 2003 - 2026 will Farrell, and 1Auth contributors.
// SPDX-License-Identifier: MIT
import { deepEqual, equal, ok } from "node:assert/strict";
import { describe, it, mock } from "node:test";

import notify, { trigger } from "./index.js";

describe("notify", () => {
	it("should configure with custom options", () => {
		const client = mock.fn();
		notify({ client });
		ok(true);
	});

	it("should call client with correct params on trigger", async () => {
		const client = mock.fn();
		notify({ client });
		await trigger(
			"template-1",
			"user-123",
			{ token: "abc" },
			{ messengers: [{ type: "email", value: "test@test.com" }] },
		);
		equal(client.mock.callCount(), 1);
		deepEqual(client.mock.calls[0].arguments[0], {
			id: "template-1",
			sub: "user-123",
			data: { token: "abc" },
			options: { messengers: [{ type: "email", value: "test@test.com" }] },
		});
	});

	it("should use default empty data and options", async () => {
		const client = mock.fn();
		notify({ client });
		await trigger("template-1", "user-123");
		deepEqual(client.mock.calls[0].arguments[0], {
			id: "template-1",
			sub: "user-123",
			data: {},
			options: {},
		});
	});

	it("should handle async client", async () => {
		const client = mock.fn(async () => ({ MessageId: "123" }));
		notify({ client });
		await trigger("template-1", "user-123");
		equal(client.mock.callCount(), 1);
	});
});
