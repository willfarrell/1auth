// Copyright 2003 - 2026 will Farrell, and 1Auth contributors.
// SPDX-License-Identifier: MIT
export const name = "dbsc";
export const timeToLiveKey = "remove";
export const create = async (client, table = name) => {
	const sql = `
  CREATE TABLE IF NOT EXISTS ${table}
  (
    "id"                 VARCHAR(16)   NOT NULL, -- prefix (dbsc_) + entropy (11)
    "sub"                VARCHAR(15)   NOT NULL, -- prefix (sub_) + entropy (11)

    "publicKey"          VARCHAR(1024) NOT NULL, -- device public key (JWK), not a secret

    "create"             TIMESTAMP WITH TIME ZONE DEFAULT NULL, -- NOW()
    "update"             TIMESTAMP WITH TIME ZONE DEFAULT NULL, -- NOW()
    "expire"             TIMESTAMP WITH TIME ZONE DEFAULT NULL, -- (NOW() + interval '12 hours'),
    "${timeToLiveKey}"   TIMESTAMP WITH TIME ZONE DEFAULT NULL, -- (NOW() + interval '12 hours' + interval '10 days'),

    CONSTRAINT ${table}_pkey PRIMARY KEY ("id")
  );
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
    DROP TABLE ${table};
  `;
	return await client.query(sql);
};
