import {
  SQSClient,
  GetQueueUrlCommand,
  SendMessageCommand
} from '@aws-sdk/client-sqs'

const options = {
  client: new SQSClient(),
  queueName:
    process.env.QUEUE_NAME ?? process.env.VITE_QUEUE_NAME ?? 'notify-queue'
}

export const setClient = (SQSClient) => {
  options.client = SQSClient
}
// export default (params) => setOptions(options, ['client', 'topicArn'], params)

export default async (id, sub, data = {}) => {
  console.log({ id, sub, data })
  const queueUrl = await options.client
    .send(new GetQueueUrlCommand({ QueueName: options.queueName }))
    .then((res) => res.QueueUrl)
  await options.client.send(
    new SendMessageCommand({
      QueueUrl: queueUrl,
      // MessageGroupId: suffix,
      // MessageDeduplicationId: `${suffix}_${new Date()
      //   .toISOString()
      //   .substring(0, 10)}_update`,
      MessageBody: JSON.stringify({ id, sub, data })
    })
  )
}
