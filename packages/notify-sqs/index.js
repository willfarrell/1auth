import {
  SQSClient,
  GetQueueUrlCommand,
  SendMessageCommand
} from '@aws-sdk/client-sqs'

const options = {
  client: new SQSClient(),
  queueName: 'notify-queue',
  log: false
}

export default (params) => {
  Object.assign(options, params)
}

export const trigger = async (id, sub, data = {}) => {
  const queueUrl = await options.client
    .send(new GetQueueUrlCommand({ QueueName: options.queueName }))
    .then((res) => res.QueueUrl)

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
