// Copyright 2003 - 2026 will Farrell, and 1Auth contributors.
// SPDX-License-Identifier: MIT
// Refresh challenges already spent, so a captured proof cannot be replayed while
// its challenge is still inside `challengeExpire`. A row is only useful until
// then, so `expire` is when it can go.
export const name = "dbsc_challenges";
export const timeToLiveKey = "remove";
export const create = async (client, table = name) => {
	const sql = `
  CREATE TABLE IF NOT EXISTS ${table}
  (
    "id"                 VARCHAR(256)  NOT NULL, -- seasoned digest of the challenge (jti)
    "sub"                VARCHAR(15)   NOT NULL, -- prefix (sub_) + entropy (11)

    "expire"             TIMESTAMP WITH TIME ZONE DEFAULT NULL, -- (NOW() + challengeExpire)
    "${timeToLiveKey}"   TIMESTAMP WITH TIME ZONE DEFAULT NULL, -- (expire + interval '10 days'),

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
