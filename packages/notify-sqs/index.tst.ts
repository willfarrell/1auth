/// <reference types="node" />

import configure, { getOptions, trigger } from "@1auth/notify-sqs";
import { SQSClient } from "@aws-sdk/client-sqs";
import { describe, expect, test } from "tstyche";

describe("notify-sqs", () => {
	test("configure takes partial options", () => {
		expect(
			configure({ client: new SQSClient(), queueName: "notify-queue" }),
		).type.toBe<void>();
		expect(configure()).type.toBe<void>();
		expect(configure).type.not.toBeCallableWith({ queueUrl: 1 });
	});

	test("getOptions", () => {
		expect(getOptions().client).type.toBe<SQSClient>();
		expect(getOptions().queueUrl).type.toBe<string | undefined>();
	});

	test("trigger", () => {
		expect(trigger("account-remove", "sub_1")).type.toBe<Promise<void>>();
		expect(
			trigger("authn-access-token-create", "sub_1", { expire: 1 }, {}),
		).type.toBe<Promise<void>>();
		expect(trigger).type.not.toBeCallableWith();
	});
});
