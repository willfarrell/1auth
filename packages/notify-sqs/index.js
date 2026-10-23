// Copyright 2003 - 2026 will Farrell, and 1Auth contributors.
// SPDX-License-Identifier: MIT
import {
	GetQueueUrlCommand,
	SendMessageCommand,
	SQSClient,
} from "@aws-sdk/client-sqs";

const defaults = {
	client: undefined,
	queueName: "notify-queue",
	queueUrl: undefined,
	log: false,
};
const options = {};

export default (opt = {}) => {
	Object.assign(options, defaults, opt);
	options.client ??= new SQSClient();
};
export const getOptions = () => options;

export const trigger = async (id, sub, data = {}, notifyOptions = {}) => {
	options.queueUrl ??= await options.client
		.send(new GetQueueUrlCommand({ QueueName: options.queueName }))
		.then((res) => res.QueueUrl);

	const commandParams = {
		QueueUrl: options.queueUrl,
		MessageBody: JSON.stringify({ id, sub, data, options: notifyOptions }),
	};
	if (options.log) {
		options.log("@1auth/notify-sqs SendMessageCommand", {
			QueueUrl: options.queueUrl,
			id,
			sub,
			data: Object.keys(data),
			options: notifyOptions,
		});
	}
	await options.client.send(new SendMessageCommand(commandParams));
};
