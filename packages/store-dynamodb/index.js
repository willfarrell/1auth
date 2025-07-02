import {
	BatchWriteItemCommand,
	DeleteItemCommand,
	DynamoDBClient,
	GetItemCommand,
	PutItemCommand,
	QueryCommand,
	UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";

const marshallOptions = { removeUndefinedValues: true };

const options = {
	id: "dynamodb",
	log: false,
	client: new DynamoDBClient(),
	randomId: () => {},
	// number of seconds after expire before removal
	// 10d chosen based on EFF DNT Policy
	timeToLiveExpireOffset: 10 * 24 * 60 * 60,
	timeToLiveKey: "remove",
};

export default (params) => {
	Object.assign(options, params);
};

export const exists = async (table, filters) => {
	if (options.log) {
		options.log(`@1auth/store-${options.id} exists(`, table, filters, ")");
	}
	const item = await getItem(table, filters);
	return item?.sub;
};

export const count = async (table, filters) => {
	if (options.log) {
		options.log(`@1auth/store-${options.id} count(`, table, filters, ")");
	}
	// TODO refactor to use Select COUNT
	const items = await queryCommand(table, filters);
	return items.length;
};

export const select = async (table, filters = {}, fields = []) => {
	if (options.log) {
		options.log(
			`@1auth/store-${options.id} select(`,
			table,
			filters,
			fields,
			")",
		);
	}
	// GetItemCommand doesn't support IndexName
	if (filters.sub && filters.id) {
		return await getItem(table, filters, fields);
	}
	return await queryCommand(table, filters, fields).then((res) => res[0]);
};

const getItem = async (table, filters = {}, fields = []) => {
	let indexName; // must be length of >=3
	if (filters.digest) {
		indexName ??= "digest";
	} else if (filters.sub && !filters.id) {
		indexName ??= "sub";
	} else if (filters.id && !filters.sub) {
		indexName ??= "key";
	}
	if (indexName) {
		return await queryCommand(table, filters, fields).then((res) => res?.[0]);
	}
	const commandParams = {
		TableName: table,
		Key: marshall(filters, marshallOptions),
	};
	if (fields.length) {
		commandParams.AttributesToGet = fields;
	}
	try {
		return await options.client
			.send(new GetItemCommand(commandParams))
			.then((res) => unmarshall(res.Item));
	} catch (e) {
		// if (e.message === "The provided key element does not match the schema") {
		// 	 return await queryCommand(table, filters, fields).then((res) => res[0]);
		// }
		// ResourceNotFoundException
		// if (e.message === "Requested resource not found") {
		// 	 return;
		// }
		if (e.message === "No value defined: {}") {
			return;
		}

		throw e;
	}
};

export const selectList = async (table, filters = {}, fields = []) => {
	if (options.log) {
		options.log(`@1auth/store-${options.id} selectList(`, table, filters, ")");
	}
	return await queryCommand(table, filters, fields);
};

const queryCommand = async (table, filters = {}, fields = []) => {
	let indexName; // must be length of >=3
	if (filters.digest) {
		indexName ??= "digest";
	} else if (filters.sub && !filters.id) {
		indexName ??= "sub";
	} else if (filters.id && !filters.sub) {
		indexName ??= "key";
	}

	const {
		ExpressionAttributeNames,
		ExpressionAttributeValues,
		KeyConditionExpression,
		//AttributesToGet,
	} = makeQueryParams(filters, fields);
	const commandParams = {
		TableName: table,
		IndexName: indexName,
		ExpressionAttributeNames,
		ExpressionAttributeValues,
		KeyConditionExpression,
		// return in the same order they were inserted
		ScanIndexForward: false,
	};

	// DynamoDB can't support fields
	// ValidationException: Can not use both expression and non-expression parameters in the same request: Non-expression parameters: {AttributesToGet} Expression parameters: {KeyConditionExpression}

	// Add fields to secondary indexes instead
	if (fields.length) {
		commandParams.AttributesToGet = undefined; //AttributesToGet;
	}

	return await options.client
		.send(new QueryCommand(commandParams))
		.then((res) => res.Items.map(unmarshall));
};

export const insert = async (table, values = {}) => {
	if (options.log) {
		options.log(`@1auth/store-${options.id} insert(`, table, values, ")");
	}
	if (values.expire && options.timeToLiveKey) {
		values[options.timeToLiveKey] =
			values.expire + options.timeToLiveExpireOffset;
	}
	values.id ??= options.randomId();
	const commandParams = {
		TableName: table,
		Item: marshall(values, marshallOptions),
	};
	await options.client.send(new PutItemCommand(commandParams));
	return values.id;
};

export const insertList = async (table, rows = []) => {
	if (options.log) {
		options.log(`@1auth/store-${options.id} insertList(`, table, rows, ")");
	}

	const ids = [];
	const putRequests = [];
	for (let i = 0, l = rows.length; i < l; i++) {
		const values = structuredClone(rows[i]);
		if (values.expire && options.timeToLiveKey) {
			values[options.timeToLiveKey] =
				values.expire + options.timeToLiveExpireOffset;
		}
		ids.push(values.id);
		putRequests.push({
			PutRequest: {
				Item: marshall(values, marshallOptions),
			},
		});
	}

	const commandParams = {
		RequestItems: {
			[table]: putRequests,
		},
	};
	await options.client.send(new BatchWriteItemCommand(commandParams));
	return ids;
};

export const update = async (table, filters = {}, values = {}) => {
	if (options.log) {
		options.log(
			`@1auth/store-${options.id} update(`,
			table,
			filters,
			values,
			")",
		);
	}
	// TODO Move to updateList - for updating webauthn
	// if (Array.isArray(filters.id)) {
	// 	return Promise.allSettled(
	// 		filters.id.map((id) => update(table, { ...filters, id }, values)),
	// 	);
	// }
	if (values.expire && options.timeToLiveKey) {
		values[options.timeToLiveKey] =
			values.expire + options.timeToLiveExpireOffset;
	}

	const {
		ExpressionAttributeNames,
		ExpressionAttributeValues,
		KeyConditionExpression,
	} = makeQueryParams(values);
	const commandParams = {
		TableName: table,
		Key: marshall(filters, marshallOptions),
		ExpressionAttributeNames,
		ExpressionAttributeValues,
		UpdateExpression: `SET ${KeyConditionExpression.replaceAll(" and ", ", ")}`,
	};
	await options.client.send(new UpdateItemCommand(commandParams));
};

/* export const updateList = async (table, filters = {}, params = {}) => {
  const {
    ExpressionAttributeNames,
    ExpressionAttributeValues,
    KeyConditionExpression
  } = makeQueryParams(params)
  options.log('BatchWriteItemCommand', {
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
		options.log(`@1auth/store-${options.id} remove(`, table, filters, ")");
	}
	const commandParams = {
		TableName: table,
		Key: marshall(filters, marshallOptions),
	};
	await options.client.send(new DeleteItemCommand(commandParams));
};

// Can only be used with recovery-codes for now
export const removeList = async (table, filters = {}) => {
	if (options.log) {
		options.log("@1auth/store-dynamodb removeList(", table, filters, ")");
	}

	const deleteRequests = [];
	for (let i = 0, l = filters.id.length; i < l; i++) {
		const itemFilters = structuredClone(filters);
		itemFilters.id = filters.id[i];
		deleteRequests.push({
			DeleteRequest: {
				Key: marshall(itemFilters, marshallOptions),
			},
		});
	}

	const commandParams = {
		RequestItems: {
			[table]: deleteRequests,
		},
	};
	await options.client.send(new BatchWriteItemCommand(commandParams));
};

export const makeQueryParams = (filters = {}, fields = []) => {
	const expressionAttributeNames = {};
	const expressionAttributeValues = {};
	let keyConditionExpression = [];
	let updateExpression = [];
	const attributesToGet = [];
	for (const key in filters) {
		let value = filters[key];
		if (typeof value === "undefined") {
			continue;
		}
		const isArray = Array.isArray(value);
		if (isArray) {
			value = new Set(value);
		}
		expressionAttributeNames[`#${key}`] = key;
		expressionAttributeValues[`:${key}`] = marshall(value, marshallOptions);
		if (isArray) {
			keyConditionExpression.push(`#${key} IN (:${key})`);
		} else {
			keyConditionExpression.push(`#${key} = :${key}`);
		}
		updateExpression.push(`#${key} = :${key}`);
	}
	keyConditionExpression = keyConditionExpression.join(" and ");
	updateExpression = `SET ${updateExpression.join(", ")}`;

	let projectionExpression = [];
	for (const key of fields) {
		expressionAttributeNames[`#${key}`] = key;
		projectionExpression.push(`:${key}`);
		attributesToGet.push(`:${key}`);
	}
	projectionExpression = [...new Set(projectionExpression)].join(", ");

	const commandParams = {
		ProjectionExpression: projectionExpression, // return keys
		ExpressionAttributeNames: expressionAttributeNames,
		ExpressionAttributeValues: expressionAttributeValues,
		KeyConditionExpression: keyConditionExpression,
		UpdateExpression: updateExpression,
	};
	if (attributesToGet.length) {
		commandParams.AttributesToGet = attributesToGet;
	}
	return commandParams;
};
