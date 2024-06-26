import {
  DynamoDBClient,
  GetItemCommand,
  QueryCommand,
  PutItemCommand,
  UpdateItemCommand,
  DeleteItemCommand,
  BatchWriteItemCommand,
  CreateTableCommand,
  DeleteTableCommand
} from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'

const marshallOptions = { removeUndefinedValues: true }

const options = {
  log: undefined,
  client: new DynamoDBClient(),
  // number of seconds after expire before removal
  // 10d chosen based on EFF DNT Policy
  timeToLiveExpireOffset: 10 * 24 * 60 * 60,
  timeToLiveKey: 'remove'
}

export default (params) => {
  Object.assign(options, params)
}

export const exists = async (table, filters) => {
  if (options.log) {
    options.log('@1auth/store-dynamodb exists(', table, filters, ')')
  }
  try {
    const item = await select(table, filters)
    return item?.sub
  } catch (e) {
    if (e.message === 'No value defined: {}') {
      return
    }
    throw e
  }
}

export const count = async (table, filters) => {
  if (options.log) {
    options.log('@1auth/store-dynamodb count(', table, filters, ')')
  }

  const items = await selectList(table, filters)
  return items.length
}

export const select = async (table, filters = {}, fields = []) => {
  // GetItemCommand doesn't support IndexName
  if (!(filters.sub && filters.id)) {
    return selectList(table, filters).then((res) => res[0])
  }
  if (options.log) {
    options.log('@1auth/store-dynamodb select(', table, filters, ')')
  }
  const commandParams = {
    TableName: table,
    Key: marshall(filters, marshallOptions)
  }
  if (fields.length) {
    commandParams.AttributesToGet = fields
  }
  if (options.log) {
    options.log('@1auth/store-dynamodb GetItemCommand(', commandParams, ')')
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
    if (e.message === 'No value defined: {}') {
      return
    }
    throw e
  }
}

export const selectList = async (table, filters = {}, fields = []) => {
  if (options.log) {
    options.log('@1auth/store-dynamodb selectList(', table, filters, ')')
  }
  let indexName // must be length of >=3
  if (filters.digest) {
    indexName ??= 'digest'
  } else if (filters.sub && !filters.id) {
    indexName ??= 'sub'
  } else if (filters.id && !filters.sub) {
    indexName ??= 'key'
  }

  if (!filters.type) delete filters.type // removeUndefinedValues seems to fail

  const {
    ExpressionAttributeNames,
    ExpressionAttributeValues,
    KeyConditionExpression
  } = makeQueryParams(filters)
  const commandParams = {
    TableName: table,
    IndexName: indexName,
    ExpressionAttributeNames,
    ExpressionAttributeValues,
    KeyConditionExpression
  }
  if (fields.length) {
    commandParams.AttributesToGet = fields
  }
  if (options.log) {
    options.log('@1auth/store-dynamodb QueryCommand(', commandParams, ')')
  }
  return await options.client
    .send(new QueryCommand(commandParams))
    .then((res) => res.Items.map(unmarshall))
}

export const insert = async (table, params = {}) => {
  if (options.log) {
    options.log('@1auth/store-dynamodb insert(', table, params, ')')
  }
  if (params.expire && options.timeToLiveKey) {
    params[options.timeToLiveKey] =
      params.expire + options.timeToLiveExpireOffset
  }

  // delete params.sub;
  // delete params.id;
  // delete params.encryptionKey;
  // delete params.value;
  // delete params.create;
  // delete params.update;
  // delete params.expire;
  // delete params.remove;

  const commandParams = {
    TableName: table,
    Item: marshall(params, marshallOptions)
  }
  if (options.log) {
    options.log('@1auth/store-dynamodb PutItemCommand(', commandParams, ')')
  }
  await options.client.send(new PutItemCommand(commandParams))
  return params.id
}

export const insertList = async (table, list = []) => {
  if (options.log) {
    options.log('@1auth/store-dynamodb insertList(', table, list, ')')
  }

  const ids = []
  const putRequests = list.map((params) => {
    if (params.expire && options.timeToLiveKey) {
      params[options.timeToLiveKey] =
        params.expire + options.timeToLiveExpireOffset
    }
    ids.push(params.id)
    return {
      PutRequest: {
        Item: marshall(params, marshallOptions)
      }
    }
  })

  const commandParams = {
    RequestItems: {
      [table]: putRequests
    }
  }
  if (options.log) {
    options.log(
      '@1auth/store-dynamodb BatchWriteItemCommand(',
      commandParams,
      ')'
    )
  }
  await options.client.send(new BatchWriteItemCommand(commandParams))
  return ids
}

export const update = async (table, filters = {}, params = {}) => {
  if (options.log) {
    options.log('@1auth/store-dynamodb update(', table, filters, params, ')')
  }
  if (Array.isArray(filters.id)) {
    return Promise.allSettled(
      filters.id.map((id) => update(table, { ...filters, id }, params))
    )
  }
  if (params.expire && options.timeToLiveKey) {
    params[options.timeToLiveKey] =
      params.expire + options.timeToLiveExpireOffset
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
    options.log('@1auth/store-dynamodb UpdateItemCommand(', commandParams, ')')
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
  if (options.log) {
    options.log('@1auth/store-dynamodb remove(', table, filters, ')')
  }
  const commandParams = {
    TableName: table,
    Key: marshall(filters, marshallOptions)
  }

  if (options.log) {
    options.log('@1auth/store-dynamodb DeleteItemCommand(', commandParams, ')')
  }
  await options.client.send(new DeleteItemCommand(commandParams))
}

export const makeQueryParams = (filters = {}, select = []) => {
  const expressionAttributeNames = {}
  const expressionAttributeValues = {}
  let keyConditionExpression = []
  let updateExpression = []
  for (const key in filters) {
    const isArray = Array.isArray(filters[key])
    if (isArray) {
      filters[key] = new Set(filters[key])
    }
    expressionAttributeNames[`#${key}`] = key
    expressionAttributeValues[`:${key}`] = marshall(
      filters[key],
      marshallOptions
    )
    if (isArray) {
      keyConditionExpression.push(`#${key} IN (:${key})`)
    } else {
      keyConditionExpression.push(`#${key} = :${key}`)
    }
    updateExpression.push(`#${key} = :${key}`)
  }
  keyConditionExpression = keyConditionExpression.join(' and ')
  updateExpression = `SET ${updateExpression.join(', ')}`

  let projectionExpression = []
  for (const key of select) {
    expressionAttributeNames[`#${key}`] = key
    projectionExpression.push(`#${key}`)
  }
  projectionExpression = [...new Set(projectionExpression)].join(', ')
  return {
    // ProjectionExpression: projectionExpression, // return keys
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
    KeyConditionExpression: keyConditionExpression,
    UpdateExpression: updateExpression
  }
}

export const __table = async (commandParams) => {
  const table = commandParams.TableName
  try {
    await options.client.send(new CreateTableCommand(commandParams))
  } catch (e) {
    if (e.message === 'Cannot create preexisting table') {
      await __clear(table)
      await __table(commandParams)
    } else {
      console.error('ERROR createTable', e.message)
    }
  }
}

export const __clear = async (table) => {
  await options.client.send(
    new DeleteTableCommand({
      TableName: table
    })
  )
}
