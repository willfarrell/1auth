import { SNSClient, PublishCommand } from '@aws-sdk/client-sns'

const options = {
  client: new SNSClient(),
  topicArn: undefined,
  log: false
}

export default (params) => {
  Object.assign(options, params)
}

export const trigger = async (id, sub, data = {}) => {
  const commandParams = {
    TopicArn: options.topicArn,
    Message: JSON.stringify({ id, sub, data })
  }
  if (options.log) {
    console.log('Publish', commandParams)
  }
  await options.client.send(new PublishCommand(commandParams))
}
