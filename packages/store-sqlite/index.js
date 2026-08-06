// Copyright 2003 - 2026 will Farrell, and 1Auth contributors.
// SPDX-License-Identifier: MIT

// SQLite storage. The SQL is the same as @1auth/store-sql generates; this
// package carries its own copy so it has no runtime dependency on another
// store.

const options = {
	id: "sqlite",
	// Stryker disable next-line BooleanLiteral: overwritten by default() before observation
	log: false,
	// Stryker disable next-line ObjectLiteral: overwritten by default() before observation
	client: { query: undefined }, // async (sql, parameters) => rows[]
	// number of seconds after expire before removal
	// 10d chosen based on EFF DNT Policy
	timeToLiveExpireOffset: 10 * 24 * 60 * 60,
	timeToLiveKey: "remove",
	placeholder: "?",
};

export default (opt = {}) => {
	Object.assign(options, opt);
};

export const exists = async (table, filters) => {
	log(options, "exists", table, filters);
	const { select, where, parameters } = makeSqlParts(filters, {}, ["sub"]);
	const sql = `SELECT ${select} FROM ${table} ${where} LIMIT 1`;
	const res = await options.client.query(sql, parameters);
	return res?.[0]?.sub;
};

export const count = async (table, filters = {}) => {
	log(options, "count", table, filters);
	const { where, parameters } = makeSqlParts(filters, {});
	const sql = `SELECT COUNT(*) AS count FROM ${table} ${where}`;
	const res = await options.client.query(sql, parameters);
	return Number(res[0].count);
};

export const select = async (table, filters = {}, fields = []) => {
	log(options, "select", table, filters, fields);
	const { select, where, parameters } = makeSqlParts(filters, {}, fields);
	const sql = `SELECT ${select} FROM ${table} ${where} LIMIT 1`;
	const res = await options.client.query(sql, parameters);
	const row = res?.[0];
	// Workaround because an expire filter doesn't exist yet
	parseValues(row);
	return row;
};

export const selectList = async (table, filters = {}, fields = []) => {
	log(options, "selectList", table, filters, fields);
	const { select, where, parameters } = makeSqlParts(filters, {}, fields);
	const sql = `SELECT ${select} FROM ${table} ${where}`;
	const rows = await options.client.query(sql, parameters);
	// Workaround because an expire filter doesn't exist yet
	return rows.map((row) => {
		parseValues(row);
		return row;
	});
};

export const insert = async (table, inputValues = {}) => {
	const values = makeValues(inputValues, options);
	log(options, "insert", table, values);
	const { insert, parameters } = makeSqlParts({}, values);
	const sql = `INSERT INTO ${table} ${insert} RETURNING id`;
	const res = await options.client.query(sql, parameters);
	return res[0].id;
};

export const insertList = async (table, rows = []) => {
	log(options, "insertList", table, rows);
	if (!rows.length) return [];
	const { insert, parameters } = makeInsertList(
		options.placeholder,
		rows.map((row) => makeValues(row, options)),
	);
	const sql = `INSERT INTO ${table} ${insert} RETURNING id`;
	return await options.client.query(sql, parameters);
};

export const update = async (table, filters = {}, inputValues = {}) => {
	const values = makeValues(inputValues, options);
	log(options, "update", table, filters, values);
	const { update, where, parameters } = makeSqlParts(filters, values);
	const sql = `UPDATE ${table} SET ${update} ${where}`;
	await options.client.query(sql, parameters);
};

export const updateList = async (table, filtersList = [], values = {}) => {
	log(options, "updateList", table, filtersList, values);
	return await Promise.allSettled(
		filtersList.map((filters) => update(table, filters, values)),
	);
};

export const remove = async (table, filters = {}) => {
	log(options, "remove", table, filters);
	const { where, parameters } = makeSqlParts(filters);
	const sql = `DELETE FROM ${table} ${where} RETURNING id`;
	const res = await options.client.query(sql, parameters);
	return !!res?.[0]?.id;
};

export const removeList = remove;

// --- builders -------------------------------------------------------------
// The `*For` variants take the placeholder explicitly; the bound pair at the
// bottom reads this store's options.

export const log = (options, method, ...args) => {
	if (options.log) {
		options.log(`@1auth/store-${options.id} ${method}(`, ...args, ")");
	}
};

export const getPlaceholderFor = (placeholder, idx) => {
	return placeholder === "$" ? `$${idx}` : placeholder;
};

export const makeSqlPartsFor = (
	placeholder,
	filters = {},
	values = {},
	fields = [],
	idxStart = 1,
) => {
	let idx = idxStart;
	let parameters = [];
	const keys = Object.keys(values);

	const select = fields.length ? `"${fields.join('", "')}"` : "*";

	const insertParts = [];
	const updateParts = [];
	for (const key of keys) {
		insertParts.push(getPlaceholderFor(placeholder, idx));
		updateParts.push(`"${key}" = ${getPlaceholderFor(placeholder, idx)}`);
		idx++;
	}
	const insert = `("${keys.join('", "')}") VALUES (${insertParts.join(",")})`;
	const update = updateParts.join(", ");
	parameters = parameters.concat(Object.values(values));

	let where = Object.keys(filters)
		.map((key) => {
			const value = filters[key];
			if (typeof value === "undefined") {
				return null;
			}
			if (Array.isArray(value)) {
				let sql = value
					.map(() => getPlaceholderFor(placeholder, idx++))
					.join(",");
				sql &&= `"${key}" IN (${sql})`;
				parameters = parameters.concat(value);
				return sql;
			}
			const sql = `"${key}" = ${getPlaceholderFor(placeholder, idx++)}`;
			parameters.push(value);
			return sql;
		})
		.filter((v) => v)
		.join(" AND ");
	where &&= `WHERE ${where}`;

	return { select, insert, update, where, parameters };
};

// Single multi-row `("a", "b") VALUES (?,?),(?,?)` for drivers that batch in one statement
export const makeInsertList = (placeholder, valuesList) => {
	const insertValues = [];
	let insertParameters = [];
	for (let i = 0, l = valuesList.length; i < l; i++) {
		const values = valuesList[i];
		const { insert, parameters } = makeSqlPartsFor(
			placeholder,
			{},
			values,
			undefined, // no fields: `select` is unused here
			i * Object.keys(values).length + 1,
		);
		if (i) {
			insertValues.push(insert.split("VALUES")[1]); // (?)
		} else {
			insertValues.push(insert); // (name) VALUES (?)
		}

		insertParameters = insertParameters.concat(parameters);
	}

	return { insert: insertValues.join(","), parameters: insertParameters };
};

export const withTimeToLive = (values, options) => {
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

// structuredClone + timeToLive + normalize, applied to each row of a write
export const makeValues = (inputValues, options) => {
	const values = structuredClone(inputValues);
	withTimeToLive(values, options);
	normalizeValues(values);
	return values;
};

export const normalizeValues = (values) => {
	if (!values) return;
	if (Object.hasOwn(values, "otp")) {
		values.otp = values.otp ? 1 : 0;
	}
	values.create &&= new Date(values.create * 1000).toISOString();
	values.update &&= new Date(values.update * 1000).toISOString();
	values.verify &&= new Date(values.verify * 1000).toISOString();
	values.lastused &&= new Date(values.lastused * 1000).toISOString();
	values.expire &&= new Date(values.expire * 1000).toISOString();
	values.remove &&= new Date(values.remove * 1000).toISOString();
	for (const [key, v] of Object.entries(values)) {
		// Stryker disable next-line ConditionalExpression,StringLiteral: dropping the
		// string guard is an equivalent mutant -- strings then fall through to
		// String(v), which returns them unchanged.
		if (v !== null && typeof v !== "string" && typeof v !== "number") {
			values[key] =
				v === undefined
					? null
					: typeof v === "object"
						? JSON.stringify(v)
						: String(v);
		}
	}
};

export const parseValues = (values) => {
	if (!values) return;
	if (typeof values.otp === "number") {
		values.otp = !!values.otp;
	}
	values.create &&= Date.parse(values.create) / 1000;
	values.update &&= Date.parse(values.update) / 1000;
	values.verify &&= Date.parse(values.verify) / 1000;
	values.lastused &&= Date.parse(values.lastused) / 1000;
	values.expire &&= Date.parse(values.expire) / 1000;
	values.remove &&= Date.parse(values.remove) / 1000;
};

// export for testing
export const getPlaceholder = (idx) =>
	getPlaceholderFor(options.placeholder, idx);
export const makeSqlParts = (filters, values, fields, idxStart) =>
	makeSqlPartsFor(options.placeholder, filters, values, fields, idxStart);
