import {
  DynamoDBClient,
  GetItemCommand,
  QueryCommand,
  PutItemCommand,
  UpdateItemCommand,
  DeleteItemCommand
  // BatchWriteItemCommand
} from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'

const marshallOptions = { removeUndefinedValues: true }

const options = {
  log: false,
  client: new DynamoDBClient()
}

export default (params) => {
  Object.assign(options, params)
}

export const exists = async (table, filters) => {
  const item = await select(table, filters)
  return item?.sub
}

export const selectList = async (table, filters = {}) => {
  let indexName
  if (filters.digest) indexName ??= 'digest'
  // Allow type to be undefined
  if (filters.sub && Object.keys(filters).includes('type')) indexName ??= 'sub'

  if (!filters.type) delete filters.type // removeUndefinedValues seems to fail

  const commandParams = {
    TableName: table,
    IndexName: indexName,
    ...makeQueryParams(filters)
  }
  if (options.log) {
    console.log('QueryCommand', commandParams)
  }
  return options.client
    .send(new QueryCommand(commandParams))
    .then((res) => res.Items.map(unmarshall))
}
// TODO add in attributes to select
export const select = async (table, filters = {}) => {
  if (filters.digest) {
    // GetItemCommand doesn't support IndexName
    return selectList(table, filters).then((res) => res[0])
  }

  const commandParams = {
    TableName: table,
    Key: marshall(filters, marshallOptions)
  }
  if (options.log) {
    console.log('GetItemCommand', commandParams)
  }
  try {
    return await options.client
      .send(new GetItemCommand(commandParams))
      .then((res) => unmarshall(res.Item))
  } catch (e) {
    if (e.message === 'The provided key element does not match the schema') {
      return selectList(table, filters).then((res) => res[0])
    }
    // ResourceNotFoundException
    if (e.message === 'Requested resource not found') {
      return
    }
    throw e
  }
}

export const insert = async (table, params = {}) => {
  const commandParams = {
    TableName: table,
    Item: marshall(params, marshallOptions)
  }
  if (options.log) {
    console.log('PutItemCommand', commandParams)
  }
  await options.client.send(new PutItemCommand(commandParams))
}

export const update = async (table, filters = {}, params = {}) => {
  if (Array.isArray(filters.id)) {
    return Promise.allSettled(
      filters.id.map((id) => update(table, { ...filters, id }, params))
    )
  }
  const {
    ExpressionAttributeNames,
    ExpressionAttributeValues,
    KeyConditionExpression
  } = makeQueryParams(params)
  const commandParams = {
    TableName: table,
    Key: marshall(filters, marshallOptions),
    ExpressionAttributeNames,
    ExpressionAttributeValues,
    UpdateExpression: 'SET ' + KeyConditionExpression.replaceAll(' and ', ', ')
  }
  if (options.log) {
    console.log('UpdateItemCommand', commandParams)
  }
  await options.client.send(new UpdateItemCommand(commandParams))
}

/* export const updateList = async (table, filters = {}, params = {}) => {
  const {
    ExpressionAttributeNames,
    ExpressionAttributeValues,
    KeyConditionExpression
  } = makeQueryParams(params)
  console.log('BatchWriteItemCommand', {
    TableName: table,
    Key: marshall(filters, marshallOptions),
    ExpressionAttributeNames,
    ExpressionAttributeValues,
    UpdateExpression: `SET ` + KeyConditionExpression.replace(' and ', ', ')
  })
  await client.send(
    new BatchWriteItemCommand({
      RequestItems:{
        [table]: filters.id.map(id => ({
            PutRequest: {
              Key:
            }
          }))
      }
      TableName: table,
      Key: marshall(filters, marshallOptions),
      ExpressionAttributeNames,
      ExpressionAttributeValues,
      UpdateExpression: `SET ` + KeyConditionExpression.replace(' and ', ', ')
    })
  )
} */

export const remove = async (table, filters = {}) => {
  console.log('DeleteItemCommand', {
    TableName: table,
    Key: filters
  })
  await options.client.send(
    new DeleteItemCommand({
      TableName: table,
      Key: marshall(filters, marshallOptions)
    })
  )
}

const makeQueryParams = (filters = {}, select = []) => {
  const expressionAttributeNames = {}
  const expressionAttributeValues = {}
  let keyConditionExpression = []
  for (const key in filters) {
    if (Array.isArray(filters[key])) {
      filters[key] = new Set(filters[key])
    }
    expressionAttributeNames[`#${key}`] = key
    expressionAttributeValues[`:${key}`] = marshall(
      filters[key],
      marshallOptions
    )
    keyConditionExpression.push(`#${key} = :${key}`)
  }
  keyConditionExpression = keyConditionExpression.join(' and ')
  let projectionExpression = []
  for (const key of select) {
    expressionAttributeNames[`#${key}`] = key
    projectionExpression.push(`#${key}`)
  }
  projectionExpression = [...new Set(projectionExpression)].join(', ')
  return {
    // ProjectionExpression: projectionExpression, // return keys
    ExpressionAttributeNames: expressionAttributeNames,
    KeyConditionExpression: keyConditionExpression,
    ExpressionAttributeValues: expressionAttributeValues
  }
}

// const makeQueryParams = (
//   mediaName,
//   ecosystem,
//   characteristicName,
//   methodSpeciation,
//   sampleFraction,
//   unit,
//   region
// ) => {
//   return {
//     TableName: 'guidelines',
//     IndexName: 'parameter',
//     ProjectionExpression:
//       'ecosystem, mediaName, publisher, #status, protectionLevel, #value', // return keys
//     KeyConditionExpression: 'parameterKey = :parameterKey',
//     FilterExpression: 'contains(regionsKey, :region)',
//     ExpressionAttributeNames: {
//       '#status': 'status',
//       '#value': 'value'
//     },
//     ExpressionAttributeValues: {
//       ':parameterKey': `${mediaName}#${ecosystem}#${characteristicName}#${methodSpeciation}#${sampleFraction}#${unit}`,
//       ':region': region + '#'
//     }
//   }
// }
