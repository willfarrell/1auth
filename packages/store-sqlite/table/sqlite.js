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
    "otp"    INTEGER                  DEFAULT NULL,

    "create"           TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    "update"           TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    "verify"           TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    "lastused"         TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    "expire"           TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    "${timeToLiveKey}" TIMESTAMP WITH TIME ZONE DEFAULT NULL
  )
  `;
	return await client.query(sql);
};

export const truncate = async (client, table = name) => {
	const sql = `
    DELETE FROM ${table};
  `;
	return await client.query(sql);
};

export const drop = async (client, table = name) => {
	const sql = `
    DROP TABLE IF EXISTS ${table};
  `;
	return await client.query(sql);
};

export const emptyRow = () =>
	Object.assign(Object.create(null), {
		id: 0,
		sub: null,
		value: null,
		digest: null,
		otp: null,
		create: null,
		update: null,
		verify: null,
		lastused: null,
		expire: null,
		remove: null,
	});
