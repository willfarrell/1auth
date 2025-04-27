const options = {
	id: "sqlite",
	log: false,
	client: { query: undefined }, // async (sql, parameters) => {}
	// number of seconds after expire before removal
	// 10d chosen based on EFF DNT Policy
	timeToLiveExpireOffset: 10 * 24 * 60 * 60,
	timeToLiveKey: "remove",
	placeholder: "?",
};

export default (params) => {
	Object.assign(options, params);
};

export const exists = async (table, filters) => {
	if (options.log) {
		options.log(`@1auth/store-${options.id} exists(`, table, filters, ")");
	}
	const { select, where, parameters } = makeSqlParts(filters, {}, ["sub"]);
	const sql = `SELECT ${select} FROM ${table} ${where} LIMIT 1`;
	return await options.client
		.query(sql, parameters)
		.then((res) => res?.[0]?.sub);
};

export const count = async (table, filters = {}) => {
	if (options.log) {
		options.log(`@1auth/store-${options.id} count(`, table, filters, ")");
	}
	const { where, parameters } = makeSqlParts(filters, {});
	const sql = `SELECT COUNT(*) AS count FROM ${table} ${where}`;
	return await options.client
		.query(sql, parameters)
		.then((res) => res[0].count);
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
	const { select, where, parameters } = makeSqlParts(filters, {}, fields);
	const sql = `SELECT ${select} FROM ${table} ${where} LIMIT 1`;
	return await options.client
		.query(sql, parameters)
		.then((res) => res?.[0])
		// Workaround because an expire filter doesn't exists yet'
		.then((row) => {
			parseValues(row);
			return row;
		});
};

export const selectList = async (table, filters = {}, fields = []) => {
	if (options.log) {
		options.log(
			`@1auth/store-${options.id} selectList(`,
			table,
			filters,
			fields,
			")",
		);
	}
	const { select, where, parameters } = makeSqlParts(filters, {}, fields);
	const sql = `SELECT ${select} FROM ${table} ${where}`;
	return await options.client
		.query(sql, parameters)
		// Workaround because an expire filter doesn't exists yet'
		.then((rows) => {
			return rows.map((row) => {
				parseValues(row);
				return row;
			});
		});
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
	normalizeValues(values);
	const { insert, parameters } = makeSqlParts({}, values);
	const sql = `INSERT INTO ${table} ${insert} RETURNING id`;
	const res = await options.client.query(sql, parameters);
	return res.id;
};

export const insertList = async (table, rows = []) => {
	if (options.log) {
		options.log(`@1auth/store-${options.id} insertList(`, table, rows, ")");
	}
	const insertValues = [];
	let insertParameters = [];
	for (let i = 0, l = rows.length; i < l; i++) {
		const values = structuredClone(rows[i]);
		if (values.expire && options.timeToLiveKey) {
			values[options.timeToLiveKey] =
				values.expire + options.timeToLiveExpireOffset;
		}
		normalizeValues(values);
		const { insert, parameters } = makeSqlParts(
			{},
			values,
			[],
			i * Object.keys(values).length + 1,
		);
		if (i) {
			insertValues.push(insert.split("VALUES")[1]); // (?)
		} else {
			insertValues.push(insert); // (name) VALUES (?)
		}

		insertParameters = insertParameters.concat(parameters);
	}

	const sql = `INSERT INTO ${table} ${insertValues.join(",")} RETURNING id`;
	const res = await options.client.query(sql, insertParameters);
	return res;
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
	normalizeValues(values);
	const { update, where, parameters } = makeSqlParts(filters, values);
	const sql = `UPDATE ${table} SET ${update} ${where}`;
	await options.client.query(sql, parameters);
};

export const remove = async (table, filters = {}) => {
	if (options.log) {
		options.log(`@1auth/store-${options.id} remove(`, table, filters, ")");
	}
	const { where, parameters } = makeSqlParts(filters);
	const sql = `DELETE FROM ${table} ${where}`;
	await options.client.query(sql, parameters);
};

export const removeList = remove;

const normalizeValues = (values) => {
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
};

const parseValues = (values) => {
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
export const getPlaceholder = (idx) => {
	return options.placeholder === "$" ? `$${idx}` : options.placeholder;
};
export const makeSqlParts = (
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
		// insertParts.push("$" + idx);
		// updateParts.push('"' + key + '" = $' + idx);
		insertParts.push(getPlaceholder(idx));
		updateParts.push(`"${key}" = ${getPlaceholder(idx)}`);
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
				let sql = value.map(() => getPlaceholder(idx++)).join(",");
				sql &&= `"${key}" IN (${sql})`;
				parameters = parameters.concat(value);
				return sql;
			}
			// const sql = '"' + key + '" = $' + idx++;
			const sql = `"${key}" = ${getPlaceholder(idx++)}`;
			parameters.push(value);
			return sql;
		})
		.filter((v) => v)
		.join(" AND ");
	where &&= `WHERE ${where}`;

	return { select, insert, update, where, parameters };
};
