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

let client = new DynamoDBClient()
export const setClient = (ddbClient) => {
  client = ddbClient
}

export const exists = async (table, filters) => {
  console.log('exists', { table })
  const item = await select(table, filters)
  return item?.sub
}

export const selectList = async (table, filters = {}) => {
  let indexName
  if (filters.username) indexName ??= 'username'
  if (filters.digest) indexName ??= 'digest'
  // Allow type to be undefined
  if (filters.sub && Object.keys(filters).includes('type')) indexName ??= 'sub'

  if (!filters.type) delete filters.type // removeUndefinedValues seems to fail

  console.log('QueryCommand', {
    TableName: table,
    IndexName: indexName,
    ...makeQueryParams(filters)
  })
  return client
    .send(
      new QueryCommand({
        TableName: table,
        IndexName: indexName,
        ...makeQueryParams(filters)
      })
    )
    .then((res) => res.Items.map(unmarshall))
}
// TODO add in attributes to select
export const select = async (table, filters = {}) => {
  console.log('GetItemCommand', {
    TableName: table,
    Key: marshall(filters, marshallOptions)
  })
  try {
    return await client
      .send(
        new GetItemCommand({
          TableName: table,
          Key: marshall(filters, marshallOptions)
        })
      )
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
  console.log('PutItemCommand', {
    TableName: table,
    Item: marshall(params, marshallOptions)
  })
  await client.send(
    new PutItemCommand({
      TableName: table,
      Item: marshall(params, marshallOptions)
    })
  )
  return params.id
}

export const update = async (table, filters = {}, params = {}) => {
  if (Array.isArray(filters.id)) {
    return Promise.allSettled(
      filters.id.map((id) => update(table, { id }, params))
    )
  }
  const {
    ExpressionAttributeNames,
    ExpressionAttributeValues,
    KeyConditionExpression
  } = makeQueryParams(params)
  console.log('UpdateItemCommand', {
    TableName: table,
    Key: marshall(filters, marshallOptions),
    ExpressionAttributeNames,
    ExpressionAttributeValues,
    UpdateExpression: 'SET ' + KeyConditionExpression.replaceAll(' and ', ', ')
  })
  await client.send(
    new UpdateItemCommand({
      TableName: table,
      Key: marshall(filters, marshallOptions),
      ExpressionAttributeNames,
      ExpressionAttributeValues,
      UpdateExpression:
        'SET ' + KeyConditionExpression.replaceAll(' and ', ', ')
    })
  )
}

/* export const updateList = async (table, filters = {}, params = {}) => {
  const {
    ExpressionAttributeNames,
    ExpressionAttributeValues,
    KeyConditionExpression
  } = makeQueryParams(params)
  console.log('BatchWriteItemCommand', {
    TableName: table,
    Key: marshall(filters),
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
      Key: marshall(filters),
      ExpressionAttributeNames,
      ExpressionAttributeValues,
      UpdateExpression: `SET ` + KeyConditionExpression.replace(' and ', ', ')
    })
  )
} */

export const remove = async (table, filters = {}) => {
  console.log('DeleteItemCommand', {
    TableName: table,
    Key: marshall(filters, marshallOptions)
  })
  await client.send(
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

export default { exists, select, selectList, insert, update, remove }
