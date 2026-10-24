// Copyright 2003 - 2026 will Farrell, and 1Auth contributors.
// SPDX-License-Identifier: MIT
import type { SQSClient } from "@aws-sdk/client-sqs";

export interface NotifySqsOptions {
	/** Created with `new SQSClient()` when not given. */
	client: SQSClient;
	queueName: string;
	/** Looked up from `queueName` on first `trigger` when not given. */
	queueUrl: string | undefined;
	log: ((...args: unknown[]) => void) | false;
}

declare function configure(opt?: Partial<NotifySqsOptions>): void;
export default configure;

export function getOptions(): NotifySqsOptions;

/** Sends `{ id, sub, data, options }` as the JSON message body. */
export function trigger(
	id: string,
	sub: string,
	data?: Record<string, unknown>,
	notifyOptions?: Record<string, unknown>,
): Promise<void>;
