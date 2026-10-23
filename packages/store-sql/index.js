// Copyright 2003 - 2026 will Farrell, and 1Auth contributors.
// SPDX-License-Identifier: MIT

export const createSqlStore = ({
	id,
	placeholder = "?",
	query = (client, sql, parameters) => client.query(sql, parameters),
}) => {
	const options = {
		id,
		log: undefined,
		client: undefined,
		// 10d chosen based on EFF DNT Policy
		timeToLiveExpireOffset: 10 * 24 * 60 * 60,
		timeToLiveKey: "remove",
		placeholder,
	};

	const configure = (opt = {}) => {
		Object.assign(options, opt);
	};

	const run = (sql, parameters) => query(options.client, sql, parameters);

	const getPlaceholder = (idx) => getPlaceholderFor(options.placeholder, idx);
	const makeSqlParts = (filters, values, fields, idxStart) =>
		makeSqlPartsFor(options.placeholder, filters, values, fields, idxStart);

	const exists = async (table, filters) => {
		log(options, "exists", table, filters);
		const { select, where, parameters } = makeSqlParts(filters, {}, ["sub"]);
		const sql = `SELECT ${select} FROM ${table} ${where} LIMIT 1`;
		const res = await run(sql, parameters);
		return res?.[0]?.sub;
	};

	const select = async (table, filters = {}, fields = []) => {
		log(options, "select", table, filters, fields);
		const { select, where, parameters } = makeSqlParts(filters, {}, fields);
		const sql = `SELECT ${select} FROM ${table} ${where} LIMIT 1`;
		const res = await run(sql, parameters);
		const row = res?.[0];
		parseValues(row);
		return row;
	};

	const selectList = async (table, filters = {}, fields = []) => {
		log(options, "selectList", table, filters, fields);
		const { select, where, parameters } = makeSqlParts(filters, {}, fields);
		const sql = `SELECT ${select} FROM ${table} ${where}`;
		const rows = await run(sql, parameters);
		return rows.map((row) => {
			parseValues(row);
			return row;
		});
	};

	const insert = async (table, inputValues = {}) => {
		const values = makeValues(inputValues, options);
		log(options, "insert", table, values);
		const { insert, parameters } = makeSqlParts({}, values);
		const sql = `INSERT INTO ${table} ${insert} RETURNING id`;
		const res = await run(sql, parameters);
		return res[0].id;
	};

	const insertList = async (table, rows = []) => {
		log(options, "insertList", table, rows);
		if (!rows.length) return [];
		const { insert, parameters } = makeInsertList(
			options.placeholder,
			rows.map((row) => makeValues(row, options)),
		);
		const sql = `INSERT INTO ${table} ${insert} RETURNING id`;
		return await run(sql, parameters);
	};

	const update = async (table, filters = {}, inputValues = {}) => {
		const values = makeValues(inputValues, options);
		log(options, "update", table, filters, values);
		const { update, where, parameters } = makeSqlParts(filters, values);
		assertWhere(table, where);
		const sql = `UPDATE ${table} SET ${update} ${where}`;
		await run(sql, parameters);
	};

	const remove = async (table, filters = {}) => {
		log(options, "remove", table, filters);
		const { where, parameters } = makeSqlParts(filters);
		assertWhere(table, where);
		const sql = `DELETE FROM ${table} ${where} RETURNING id`;
		const res = await run(sql, parameters);
		return !!res?.[0]?.id;
	};

	return {
		default: configure,
		exists,
		select,
		selectList,
		insert,
		insertList,
		update,
		remove,
		removeList: remove,
		getPlaceholder,
		makeSqlParts,
	};
};

const store = createSqlStore({ id: "sql" });
export default store.default;
export const {
	exists,
	select,
	selectList,
	insert,
	insertList,
	update,
	remove,
	removeList,
	getPlaceholder,
	makeSqlParts,
} = store;

// --- builders -------------------------------------------------------------

export const log = (options, method, ...args) => {
	if (options.log) {
		options.log(`@1auth/store-${options.id} ${method}(`, ...args, ")");
	}
};

const identifierPattern = /^[A-Za-z_][A-Za-z0-9_]*$/;
const quote = (key) => {
	if (!identifierPattern.test(key)) {
		throw new Error("@1auth/store-sql invalid identifier", { cause: { key } });
	}
	return `"${key}"`;
};

const assertWhere = (table, where) => {
	if (!where) {
		throw new Error("@1auth/store-sql refusing to write without a filter", {
			cause: { table },
		});
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

	const select = fields.length ? fields.map(quote).join(", ") : "*";

	const insertParts = [];
	const updateParts = [];
	for (const key of keys) {
		insertParts.push(getPlaceholderFor(placeholder, idx));
		updateParts.push(`${quote(key)} = ${getPlaceholderFor(placeholder, idx)}`);
		idx++;
	}
	const insert = `(${keys.map(quote).join(", ")}) VALUES (${insertParts.join(",")})`;
	const update = updateParts.join(", ");
	parameters = parameters.concat(Object.values(values));

	let where = Object.keys(filters)
		.map((key) => {
			const value = filters[key];
			if (typeof value === "undefined") {
				throw new Error("@1auth/store-sql filter value is undefined", {
					cause: { key },
				});
			}
			if (Array.isArray(value)) {
				if (!value.length) {
					throw new Error("@1auth/store-sql filter value is an empty array", {
						cause: { key },
					});
				}
				const sql = value
					.map(() => getPlaceholderFor(placeholder, idx++))
					.join(",");
				parameters = parameters.concat(value);
				return `${quote(key)} IN (${sql})`;
			}
			const sql = `${quote(key)} = ${getPlaceholderFor(placeholder, idx++)}`;
			parameters.push(value);
			return sql;
		})
		.join(" AND ");
	where &&= `WHERE ${where}`;

	return { select, insert, update, where, parameters };
};

export const makeInsertList = (placeholder, valuesList) => {
	if (!valuesList.length) return { insert: "", parameters: [] };
	const columns = [...new Set(valuesList.flatMap(Object.keys))];
	const parameters = [];
	let idx = 1;
	const groups = valuesList.map((values) => {
		const group = columns.map((column) => {
			parameters.push(Object.hasOwn(values, column) ? values[column] : null);
			return getPlaceholderFor(placeholder, idx++);
		});
		return `(${group.join(",")})`;
	});
	return {
		insert: `(${columns.map(quote).join(", ")}) VALUES ${groups.join(", ")}`,
		parameters,
	};
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
		if (v === undefined) {
			values[key] = null;
		} else if (v !== null && typeof v === "object") {
			values[key] = JSON.stringify(v);
		} else if (v !== null && typeof v !== "number") {
			values[key] = String(v);
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
