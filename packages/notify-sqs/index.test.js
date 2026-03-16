// Copyright 2003 - 2026 will Farrell, and 1Auth contributors.
// SPDX-License-Identifier: MIT
import { deepEqual, equal, ok } from "node:assert/strict";
import { describe, it, mock } from "node:test";

import notifySqs, { trigger } from "./index.js";

describe("notify-sqs", () => {
	it("should configure with custom options", () => {
		const mockClient = { send: mock.fn() };
		notifySqs({
			client: mockClient,
			queueUrl: "https://sqs.us-east-1.amazonaws.com/123/test-queue",
		});
		ok(true);
	});

	it("should send message to SQS with correct params", async () => {
		const mockSend = mock.fn(async () => ({}));
		const mockClient = { send: mockSend };
		notifySqs({
			client: mockClient,
			queueUrl: "https://sqs.us-east-1.amazonaws.com/123/test-queue",
			log: false,
		});

		await trigger(
			"template-1",
			"user-123",
			{ token: "abc" },
			{ messengers: [] },
		);

		const lastCall = mockSend.mock.calls[mockSend.mock.callCount() - 1];
		const command = lastCall.arguments[0];
		const parsed = JSON.parse(command.input.MessageBody);
		deepEqual(parsed, {
			id: "template-1",
			sub: "user-123",
			data: { token: "abc" },
			options: { messengers: [] },
		});
	});

	it("should resolve queueUrl from queueName if not provided", async () => {
		const mockSend = mock.fn(async (cmd) => {
			if (cmd.input?.QueueName) {
				return {
					QueueUrl: "https://sqs.us-east-1.amazonaws.com/123/resolved-queue",
				};
			}
			return {};
		});
		const mockClient = { send: mockSend };
		notifySqs({
			client: mockClient,
			queueUrl: undefined,
			queueName: "my-queue",
			log: false,
		});

		await trigger("template-1", "user-123");

		// First call should be GetQueueUrlCommand, second should be SendMessageCommand
		equal(mockSend.mock.callCount(), 2);
	});

	it("should log when log option is set", async () => {
		const mockSend = mock.fn(async () => ({}));
		const mockLog = mock.fn();
		const mockClient = { send: mockSend };
		notifySqs({
			client: mockClient,
			queueUrl: "https://sqs.us-east-1.amazonaws.com/123/test-queue",
			log: mockLog,
		});

		await trigger("template-1", "user-123");

		equal(mockLog.mock.callCount(), 1);
		ok(mockLog.mock.calls[0].arguments[0].includes("@1auth/notify-sqs"));
	});

	it("should use default empty data and options", async () => {
		const mockSend = mock.fn(async () => ({}));
		const mockClient = { send: mockSend };
		notifySqs({
			client: mockClient,
			queueUrl: "https://sqs.us-east-1.amazonaws.com/123/test-queue",
			log: false,
		});

		await trigger("template-1", "user-123");

		const lastCall = mockSend.mock.calls[mockSend.mock.callCount() - 1];
		const parsed = JSON.parse(lastCall.arguments[0].input.MessageBody);
		deepEqual(parsed.data, {});
		deepEqual(parsed.options, {});
	});
});
