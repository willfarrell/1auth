// Copyright 2003 - 2026 will Farrell, and 1Auth contributors.
// SPDX-License-Identifier: MIT

/** How and who to send the message to. */
export interface NotifyOptions {
	/** Each entry is `{ id }` or `{ type, value }`. */
	messengers?: Record<string, unknown>[];
	/** Allowed messenger types. */
	types?: string[];
	[key: string]: unknown;
}

export interface NotifyMessage {
	/** Template id. */
	id: string;
	sub: string;
	/** Template values, e.g. `{ token, username, expire }`. */
	data: Record<string, unknown>;
	options: NotifyOptions;
}

export interface NotifyConfig {
	client: (message: NotifyMessage) => unknown;
}

declare function configure(opt?: Partial<NotifyConfig>): void;
export default configure;

export function trigger(
	id: string,
	sub: string,
	data?: Record<string, unknown>,
	notifyOptions?: NotifyOptions,
): Promise<void>;
