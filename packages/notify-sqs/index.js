import {
  SQSClient,
  GetQueueUrlCommand,
  SendMessageCommand
} from '@aws-sdk/client-sqs'

const options = {
  client: new SQSClient(),
  queueName: 'notify-queue',
  queueUrl: undefined,
  log: false
}

export default (params) => {
  Object.assign(options, params)
  options.queueUrl = options.client
    .send(new GetQueueUrlCommand({ QueueName: options.queueName }))
    .then((res) => res.QueueUrl)
}

export const trigger = async (id, sub, data = {}) => {
  const queueUrl = await options.queueUrl

  const commandParams = {
    QueueUrl: queueUrl,
    // MessageGroupId: suffix,
    // MessageDeduplicationId: `${suffix}_${new Date()
    //   .toISOString()
    //   .substring(0, 10)}_update`,
    MessageBody: JSON.stringify({ id, sub, data })
  }
  if (options.log) {
    console.log('SendMessage', commandParams)
  }
  await options.client.send(new SendMessageCommand(commandParams))
}
