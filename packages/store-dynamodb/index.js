// Copyright 2003 - 2026 will Farrell, and 1Auth contributors.
// SPDX-License-Identifier: MIT
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

export default (opt = {}) => {
	Object.assign(options, opt);
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
	const commandParams = buildQueryCommand(table, filters);
	commandParams.Select = "COUNT";
	return await options.client
		.send(new QueryCommand(commandParams))
		.then((res) => res.Count);
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
	// Only pass table key attributes to GetItemCommand
	const key = {};
	if (filters.sub !== undefined) key.sub = filters.sub;
	if (filters.id !== undefined) key.id = filters.id;
	const commandParams = {
		TableName: table,
		Key: marshall(key, marshallOptions),
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

const buildQueryCommand = (table, filters = {}) => {
	let indexName; // must be length of >=3
	let partitionKey;
	if (filters.digest) {
		indexName = "digest";
		partitionKey = "digest";
	} else if (filters.sub && !filters.id) {
		indexName = "sub";
		partitionKey = "sub";
	} else if (filters.id && !filters.sub) {
		indexName = "key";
		partitionKey = "id";
	} else {
		partitionKey = "sub";
	}

	// Determine which attributes are key attributes for this index
	const keyAttributeSet = new Set([partitionKey]);
	if (indexName === "sub" || indexName === "digest") {
		if (filters.type !== undefined) keyAttributeSet.add("type");
	} else if (!indexName) {
		keyAttributeSet.add("id");
	}

	const expressionAttributeNames = {};
	const expressionAttributeValues = {};
	const keyConditions = [];
	const filterConditions = [];
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
		const condition = isArray ? `#${key} IN (:${key})` : `#${key} = :${key}`;
		if (keyAttributeSet.has(key)) {
			keyConditions.push(condition);
		} else {
			filterConditions.push(condition);
		}
	}

	const commandParams = {
		TableName: table,
		IndexName: indexName,
		ExpressionAttributeNames: expressionAttributeNames,
		ExpressionAttributeValues: expressionAttributeValues,
		KeyConditionExpression: keyConditions.join(" and "),
	};
	if (filterConditions.length) {
		commandParams.FilterExpression = filterConditions.join(" and ");
	}
	return commandParams;
};

const queryCommand = async (table, filters = {}, fields = []) => {
	const commandParams = buildQueryCommand(table, filters);
	// return in the same order they were inserted
	commandParams.ScanIndexForward = false;

	return await options.client
		.send(new QueryCommand(commandParams))
		.then((res) => res.Items.map(unmarshall));
};

export const insert = async (table, inputValues = {}) => {
	const values = structuredClone(inputValues);
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

export const update = async (table, filters = {}, inputValues = {}) => {
	const values = structuredClone(inputValues);
	if (options.log) {
		options.log(
			`@1auth/store-${options.id} update(`,
			table,
			filters,
			values,
			")",
		);
	}
	if (values.expire && options.timeToLiveKey) {
		values[options.timeToLiveKey] =
			values.expire + options.timeToLiveExpireOffset;
	}

	const {
		ExpressionAttributeNames,
		ExpressionAttributeValues,
		KeyConditionExpression,
	} = makeQueryParams(values);
	// Only pass table key attributes to UpdateItemCommand
	const key = {};
	if (filters.sub !== undefined) key.sub = filters.sub;
	if (filters.id !== undefined) key.id = filters.id;
	const commandParams = {
		TableName: table,
		Key: marshall(key, marshallOptions),
		ExpressionAttributeNames,
		ExpressionAttributeValues,
		UpdateExpression: `SET ${KeyConditionExpression.replaceAll(" and ", ", ")}`,
	};
	await options.client.send(new UpdateItemCommand(commandParams));
};

export const updateList = async (table, filtersList = [], values = {}) => {
	if (options.log) {
		options.log(
			`@1auth/store-${options.id} updateList(`,
			table,
			filtersList,
			values,
			")",
		);
	}
	return Promise.allSettled(
		filtersList.map((filters) => update(table, filters, values)),
	);
};

export const remove = async (table, filters = {}) => {
	if (options.log) {
		options.log(`@1auth/store-${options.id} remove(`, table, filters, ")");
	}
	const key = {};
	if (filters.sub !== undefined) key.sub = filters.sub;
	if (filters.id !== undefined) key.id = filters.id;
	const hasNonKeyFilters = Object.keys(filters).some(
		(k) => k !== "sub" && k !== "id",
	);
	if (hasNonKeyFilters) {
		// Non-key attributes can't be used in DeleteItemCommand.
		// Query to find matching items, then delete each by primary key.
		const items = await queryCommand(table, filters);
		for (const item of items) {
			await options.client.send(
				new DeleteItemCommand({
					TableName: table,
					Key: marshall({ sub: item.sub, id: item.id }, marshallOptions),
				}),
			);
		}
		return;
	}
	await options.client.send(
		new DeleteItemCommand({
			TableName: table,
			Key: marshall(key, marshallOptions),
		}),
	);
};

// Can only be used with recovery-codes for now
export const removeList = async (table, filters = {}) => {
	if (options.log) {
		options.log(`@1auth/store-${options.id} removeList(`, table, filters, ")");
	}

	const deleteRequests = [];
	for (let i = 0, l = filters.id.length; i < l; i++) {
		// Only pass table key attributes to DeleteItemCommand
		const key = { sub: filters.sub, id: filters.id[i] };
		deleteRequests.push({
			DeleteRequest: {
				Key: marshall(key, marshallOptions),
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
	const projectionExpression = [];
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

	for (const key of fields) {
		expressionAttributeNames[`#${key}`] = key;
		projectionExpression.push(`:${key}`);
		attributesToGet.push(`:${key}`);
	}

	const commandParams = {
		ExpressionAttributeNames: expressionAttributeNames,
		ExpressionAttributeValues: expressionAttributeValues,
		KeyConditionExpression: keyConditionExpression,
		UpdateExpression: updateExpression,
	};
	if (attributesToGet.length) {
		commandParams.ProjectionExpression = [
			...new Set(projectionExpression),
		].join(", "); // return keys
		commandParams.AttributesToGet = attributesToGet;
	}
	return commandParams;
};
