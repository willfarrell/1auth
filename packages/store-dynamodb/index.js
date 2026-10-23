// Copyright 2003 - 2026 will Farrell, and 1Auth contributors.
// SPDX-License-Identifier: MIT
import { setTimeout } from "node:timers/promises";
import {
	BatchWriteItemCommand,
	DeleteItemCommand,
	DynamoDBClient,
	GetItemCommand,
	PutItemCommand,
	QueryCommand,
	TransactWriteItemsCommand,
	UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { convertToAttr, marshall, unmarshall } from "@aws-sdk/util-dynamodb";

const marshallOptions = { removeUndefinedValues: true };

const defaults = {
	id: "dynamodb",
	log: false,
	client: new DynamoDBClient(),
	randomId: undefined,
	// number of seconds after expire before removal
	// 10d chosen based on EFF DNT Policy
	timeToLiveExpireOffset: 10 * 24 * 60 * 60,
	timeToLiveKey: "remove",
};
const options = {};
// Re-applied on every call, so `default()` always lands on a known state rather
// than merging onto whatever the last caller left behind. Called once here too,
// so the store still works unconfigured.
const configure = (opt = {}) => {
	Object.assign(options, defaults, opt);
};
configure();

export default configure;

const assertFilters = (filters) => {
	for (const key in filters) {
		const value = filters[key];
		if (typeof value === "undefined") {
			throw new Error("@1auth/store-dynamodb filter value is undefined", {
				cause: { key },
			});
		}
		if (Array.isArray(value) && !value.length) {
			throw new Error("@1auth/store-dynamodb filter value is an empty array", {
				cause: { key },
			});
		}
	}
};

const refuseUnfiltered = (table) => {
	throw new Error("@1auth/store-dynamodb refusing to write without a filter", {
		cause: { table },
	});
};

const isKeyAttribute = (key) => key === "sub" || key === "id";
const nonKeyFilters = (filters) =>
	Object.fromEntries(
		Object.entries(filters).filter(([key]) => !isKeyAttribute(key)),
	);
const matches = (item, filters) =>
	Object.entries(filters).every(([key, value]) =>
		Array.isArray(value) ? value.includes(item[key]) : item[key] === value,
	);

export const exists = async (table, filters) => {
	if (options.log) {
		options.log(`@1auth/store-${options.id} exists(`, table, filters, ")");
	}
	assertFilters(filters);
	const item = await getItem(table, filters);
	return item?.sub;
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
	assertFilters(filters);
	// `getItem` picks between GetItemCommand and an index query itself
	return await getItem(table, filters, fields);
};

const getItem = async (table, filters = {}, fields = []) => {
	if (getIndexName(filters)) {
		return await queryCommand(table, filters, fields).then((res) => res[0]);
	}
	// GetItemCommand only takes the table key; every other filter is checked
	// against the item it returns
	const key = { sub: filters.sub, id: filters.id };
	const others = nonKeyFilters(filters);
	const commandParams = {
		TableName: table,
		Key: marshall(key, marshallOptions),
	};
	if (fields.length) {
		commandParams.AttributesToGet = [
			...new Set([...fields, ...Object.keys(others)]),
		];
	}
	const res = await options.client.send(new GetItemCommand(commandParams));
	if (!res.Item) return;
	const item = unmarshall(res.Item);
	if (!matches(item, others)) return;
	if (!fields.length) return item;
	return Object.fromEntries(
		fields
			.filter((field) => field in item)
			.map((field) => [field, item[field]]),
	);
};

export const selectList = async (table, filters = {}, fields = []) => {
	if (options.log) {
		options.log(`@1auth/store-${options.id} selectList(`, table, filters, ")");
	}
	assertFilters(filters);
	return await queryCommand(table, filters, fields);
};

const placeholderFor = (taken, name) => {
	let placeholder = `:${name}`;
	for (let i = 1; taken.has(placeholder); i++) {
		placeholder = `:${name}_${i}`;
	}
	taken.add(placeholder);
	return placeholder;
};

const makeExpressions = (filters, prefix = "", taken = new Set()) => {
	const expressionAttributeNames = {};
	const expressionAttributeValues = {};
	const conditions = new Map();
	for (const key in filters) {
		const value = filters[key];
		if (typeof value === "undefined") {
			continue;
		}
		expressionAttributeNames[`#${key}`] = key;
		if (Array.isArray(value)) {
			const placeholders = value.map((item, idx) => {
				const placeholder = placeholderFor(taken, `${prefix}${key}_${idx}`);
				expressionAttributeValues[placeholder] = marshall(
					item,
					marshallOptions,
				);
				return placeholder;
			});
			conditions.set(key, `#${key} IN (${placeholders.join(", ")})`);
			continue;
		}
		const placeholder = placeholderFor(taken, `${prefix}${key}`);
		expressionAttributeValues[placeholder] = marshall(value, marshallOptions);
		conditions.set(key, `#${key} = ${placeholder}`);
	}
	return { expressionAttributeNames, expressionAttributeValues, conditions };
};

// Which filters DynamoDB will accept as key conditions is fixed by the index
// being queried; everything else has to go into a FilterExpression. Naming an
// attribute the filters do not carry is a no-op, so each list can be complete.
const indexKeyAttributes = {
	digest: ["digest", "type"],
	sub: ["sub", "type"],
	key: ["id"],
};

const getIndexName = (filters) => {
	if (filters.digest) return "digest";
	if (filters.sub && (!filters.id || Array.isArray(filters.id))) return "sub";
	if (filters.id && !filters.sub) return "key";
};

const buildQueryCommand = (table, filters = {}) => {
	const indexName = getIndexName(filters);
	// no index: the table itself, partitioned on sub+id
	const keyAttributeSet = new Set(
		indexKeyAttributes[indexName] ?? ["sub", "id"],
	);

	const { expressionAttributeNames, expressionAttributeValues, conditions } =
		makeExpressions(filters);
	const keyConditions = [];
	const filterConditions = [];
	for (const [key, condition] of conditions) {
		// a key condition can't take IN
		if (keyAttributeSet.has(key) && !Array.isArray(filters[key])) {
			keyConditions.push(condition);
		} else {
			filterConditions.push(condition);
		}
	}

	// DynamoDB can't Query without an equality on the partition key
	if (!keyConditions.length) {
		throw new Error("@1auth/store-dynamodb filters have no key to query on", {
			cause: { table, filters },
		});
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

	if (fields.length) {
		for (const field of fields) {
			commandParams.ExpressionAttributeNames[`#${field}`] = field;
		}
		commandParams.ProjectionExpression = fields
			.map((field) => `#${field}`)
			.join(", ");
	}

	// A page stops at 1MB, before any FilterExpression is applied, so a page can
	// be empty and still not be the last one
	const items = [];
	let ExclusiveStartKey;
	do {
		const res = await options.client.send(
			new QueryCommand({ ...commandParams, ExclusiveStartKey }),
		);
		items.push(...res.Items.map(unmarshall));
		ExclusiveStartKey = res.LastEvaluatedKey;
	} while (ExclusiveStartKey);
	return items;
};

const withTimeToLive = (values) => {
	if (
		values.expire &&
		options.timeToLiveKey &&
		values[options.timeToLiveKey] == null
	) {
		values[options.timeToLiveKey] =
			values.expire + options.timeToLiveExpireOffset;
	}
	return values;
};

const makePut = (table, values) => ({
	TableName: table,
	Item: marshall(values, marshallOptions),
	ConditionExpression:
		"attribute_not_exists(#sub) and attribute_not_exists(#id)",
	ExpressionAttributeNames: { "#sub": "sub", "#id": "id" },
});

export const insert = async (table, inputValues = {}) => {
	const values = structuredClone(inputValues);
	if (options.log) {
		options.log(`@1auth/store-${options.id} insert(`, table, values, ")");
	}
	withTimeToLive(values);
	if (values.id == null) {
		if (typeof options.randomId !== "function") {
			throw new Error(
				"@1auth/store-dynamodb insert() needs an `id`, or a `randomId` to make one",
			);
		}
		values.id = options.randomId();
	}
	await options.client.send(new PutItemCommand(makePut(table, values)));
	return values.id;
};

const batchWriteRetries = 5;
const batchWriteDelay = 25;
// BatchWriteItem takes at most 25 requests, and may hand any of them back
const batchWrite = async (table, requests) => {
	for (let i = 0, l = requests.length; i < l; i += 25) {
		let RequestItems = { [table]: requests.slice(i, i + 25) };
		for (let attempt = 0; ; attempt++) {
			const res = await options.client.send(
				new BatchWriteItemCommand({ RequestItems }),
			);
			const unprocessed = res.UnprocessedItems?.[table];
			if (!unprocessed?.length) break;
			if (attempt === batchWriteRetries) {
				throw new Error(
					"@1auth/store-dynamodb batch write left unprocessed items",
					{ cause: { table, count: unprocessed.length } },
				);
			}
			await setTimeout(batchWriteDelay * 2 ** attempt);
			RequestItems = { [table]: unprocessed };
		}
	}
};

export const insertList = async (table, rows = []) => {
	if (options.log) {
		options.log(`@1auth/store-${options.id} insertList(`, table, rows, ")");
	}
	const puts = rows.map((row) => ({
		Put: makePut(table, withTimeToLive(structuredClone(row))),
	}));
	// BatchWriteItem can't carry a condition, so an existing key would be
	// silently overwritten. A transaction takes up to 100 conditional puts and
	// writes all or none of them; a list longer than that can still fail
	// part-way, with the earlier transactions kept.
	for (let i = 0, l = puts.length; i < l; i += 100) {
		await options.client.send(
			new TransactWriteItemsCommand({ TransactItems: puts.slice(i, i + 100) }),
		);
	}
	return rows.map((row) => row.id);
};

const makeKeyedParams = (filters, taken) => {
	const key = { sub: filters.sub, id: filters.id };
	const { expressionAttributeNames, expressionAttributeValues, conditions } =
		makeExpressions(nonKeyFilters(filters), "if_", taken);
	return {
		Key: marshall(key, marshallOptions),
		ExpressionAttributeNames: expressionAttributeNames,
		ExpressionAttributeValues: expressionAttributeValues,
		conditions: [...conditions.values()],
	};
};

const makeSet = (values, taken) => {
	const names = {};
	const placeholders = {};
	const assignments = [];
	for (const key in values) {
		if (typeof values[key] === "undefined") continue;
		const placeholder = placeholderFor(taken, key);
		names[`#${key}`] = key;
		placeholders[placeholder] = convertToAttr(values[key], marshallOptions);
		assignments.push(`#${key} = ${placeholder}`);
	}
	return {
		ExpressionAttributeNames: names,
		ExpressionAttributeValues: placeholders,
		UpdateExpression: `SET ${assignments.join(", ")}`,
	};
};

const isConditionFailure = (e) => e.name === "ConditionalCheckFailedException";

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
	assertFilters(filters);
	if (filters.sub === undefined && filters.id === undefined) {
		refuseUnfiltered(table);
	}
	const taken = new Set();
	const set = makeSet(withTimeToLive(values), taken);
	const {
		Key,
		ExpressionAttributeNames,
		ExpressionAttributeValues,
		conditions,
	} = makeKeyedParams(filters, taken);
	const keyConditions = ["sub", "id"]
		.filter((key) => filters[key] !== undefined)
		.map((key) => {
			ExpressionAttributeNames[`#${key}`] = key;
			return `attribute_exists(#${key})`;
		});
	const commandParams = {
		TableName: table,
		Key,
		ExpressionAttributeNames: {
			...set.ExpressionAttributeNames,
			...ExpressionAttributeNames,
		},
		ExpressionAttributeValues: {
			...set.ExpressionAttributeValues,
			...ExpressionAttributeValues,
		},
		UpdateExpression: set.UpdateExpression,
		ConditionExpression: [...keyConditions, ...conditions].join(" and "),
	};
	try {
		await options.client.send(new UpdateItemCommand(commandParams));
	} catch (e) {
		if (!isConditionFailure(e)) throw e;
	}
};

const removeMatching = async (table, filters) => {
	const items = await queryCommand(table, filters);
	let deleted = false;
	for (const item of items) {
		const res = await options.client.send(
			new DeleteItemCommand({
				TableName: table,
				Key: marshall({ sub: item.sub, id: item.id }, marshallOptions),
				ReturnValues: "ALL_OLD",
			}),
		);
		if (res.Attributes) deleted = true;
	}
	return deleted;
};

export const remove = async (table, filters = {}) => {
	if (options.log) {
		options.log(`@1auth/store-${options.id} remove(`, table, filters, ")");
	}
	assertFilters(filters);
	if (!Object.keys(filters).length) {
		refuseUnfiltered(table);
	}
	const {
		Key,
		ExpressionAttributeNames,
		ExpressionAttributeValues,
		conditions,
	} = makeKeyedParams(filters);
	const keyed =
		!Array.isArray(filters.sub) &&
		!Array.isArray(filters.id) &&
		filters.sub !== undefined &&
		(filters.id !== undefined || !conditions.length);
	if (!keyed) {
		return await removeMatching(table, filters);
	}
	const commandParams = {
		TableName: table,
		Key,
		ReturnValues: "ALL_OLD",
	};
	if (conditions.length) {
		commandParams.ExpressionAttributeNames = ExpressionAttributeNames;
		commandParams.ExpressionAttributeValues = ExpressionAttributeValues;
		commandParams.ConditionExpression = conditions.join(" and ");
	}
	try {
		const res = await options.client.send(new DeleteItemCommand(commandParams));
		return !!res.Attributes;
	} catch (e) {
		if (!isConditionFailure(e)) throw e;
		return false;
	}
};

export const removeList = async (table, filters = {}) => {
	if (options.log) {
		options.log(`@1auth/store-${options.id} removeList(`, table, filters, ")");
	}
	assertFilters(filters);
	// BatchWriteItem can't carry a condition, so other filters (e.g. `type`)
	// take the query-then-delete route
	if (Object.keys(nonKeyFilters(filters)).length) {
		await removeMatching(table, filters);
		return;
	}
	const deleteRequests = filters.id.map((id) => ({
		DeleteRequest: {
			Key: marshall({ sub: filters.sub, id }, marshallOptions),
		},
	}));
	await batchWrite(table, deleteRequests);
};

export const makeQueryParams = (filters = {}) => {
	const { expressionAttributeNames, expressionAttributeValues, conditions } =
		makeExpressions(filters);
	return {
		ExpressionAttributeNames: expressionAttributeNames,
		ExpressionAttributeValues: expressionAttributeValues,
		KeyConditionExpression: [...conditions.values()].join(" and "),
		UpdateExpression: `SET ${[...conditions.values()].join(", ")}`,
	};
};
