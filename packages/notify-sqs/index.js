import {
	GetQueueUrlCommand,
	SQSClient,
	SendMessageCommand,
} from "@aws-sdk/client-sqs";

const options = {
	client: new SQSClient(),
	queueName: "notify-queue",
	queueUrl: undefined,
	log: false,
};

export default (params) => {
	Object.assign(options, params);
	// requires need for AWS access
	//   options.queueUrl ??= options.client
	//     .send(new GetQueueUrlCommand({ QueueName: options.queueName }))
	//     .then((res) => res.QueueUrl)
};

export const trigger = async (id, sub, data = {}, notifyOptions = {}) => {
	options.queueUrl ??= await options.client
		.send(new GetQueueUrlCommand({ QueueName: options.queueName }))
		.then((res) => res.QueueUrl);

	const commandParams = {
		QueueUrl: options.queueUrl,
		// MessageGroupId: sub ?? '',
		// MessageDeduplicationId: `${suffix}_${new Date()
		//   .toISOString()
		//   .substring(0, 10)}_update`,
		MessageBody: JSON.stringify({ id, sub, data, options: notifyOptions }),
	};
	if (options.log) {
		options.log("@1auth/notify-sqs SendMessageCommand", commandParams);
	}
	await options.client.send(new SendMessageCommand(commandParams));
};
