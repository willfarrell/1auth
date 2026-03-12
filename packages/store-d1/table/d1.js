// Copyright 2003 - 2026 will Farrell, and 1Auth contributors.
// SPDX-License-Identifier: MIT
export const name = "test";
export const timeToLiveKey = "remove";
export const create = async (client, table = name) => {
	const sql = `
  CREATE TABLE IF NOT EXISTS ${table}
  (
    "id"     INTEGER PRIMARY KEY AUTOINCREMENT,
    "sub"    VARCHAR(15)              NOT NULL,
    "value"  VARCHAR(256)             NOT NULL,
    "digest" VARCHAR(256)             DEFAULT NULL,

    "expire"           TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    "${timeToLiveKey}" TIMESTAMP WITH TIME ZONE DEFAULT NULL
  )
  `;
	return await client.prepare(sql).run();
};

export const truncate = async (client, table = name) => {
	return await client.prepare(`DELETE FROM ${table}`).run();
};

export const drop = async (client, table = name) => {
	return await client.prepare(`DROP TABLE ${table}`).run();
};

export const emptyRow = () =>
	Object.assign(Object.create(null), {
		id: 0,
		sub: null,
		value: null,
		digest: null,
		expire: null,
		remove: null,
	});
