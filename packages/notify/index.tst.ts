/// <reference types="node" />

import type { NotifyMessage } from "@1auth/notify";
import configure, { trigger } from "@1auth/notify";
import { describe, expect, test } from "tstyche";

describe("notify", () => {
	test("configure takes a client that receives the message", () => {
		expect(
			configure({
				client: (message) => {
					expect(message).type.toBe<NotifyMessage>();
				},
			}),
		).type.toBe<void>();
		expect(configure()).type.toBe<void>();
		expect(configure).type.not.toBeCallableWith({ client: "sqs" });
	});

	test("trigger", () => {
		expect(trigger("account-remove", "sub_1")).type.toBe<Promise<void>>();
		expect(
			trigger(
				"messenger-emailAddress-verify",
				"sub_1",
				{ token: "123456" },
				{ messengers: [{ id: "messenger_1" }] },
			),
		).type.toBe<Promise<void>>();
		expect(trigger).type.not.toBeCallableWith("account-remove");
	});
});
