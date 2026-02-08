// Copyright 2003 - 2026 will Farrell, and 1Auth contributors.
// SPDX-License-Identifier: MIT
export const name = "accounts";
export const timeToLiveKey = "remove";
export const create = async (client, table = name) => {
	const sql = `
	CREATE TABLE IF NOT EXISTS ${table}
   (
     "id"                 VARCHAR(19)         NOT NULL, -- prefix (user_) + entropy (11)
     "sub"                VARCHAR(15)         NOT NULL, -- prefix (sub_) + entropy (11)

     "encryptionKey"      VARCHAR(256)        NOT NULL,
     "value"              VARCHAR(512) DEFAULT NULL, -- username
     "digest"             VARCHAR(73)  DEFAULT NULL, -- of username

     "name"               VARCHAR(128) DEFAULT NULL,
     "unencrypted"        VARCHAR(128) DEFAULT NULL,

     "create"             TIMESTAMP WITH TIME ZONE DEFAULT NULL, -- postges: DEFAULT NOW(), sqlite: DEFAULT CURRENT_TIME,
     "update"             TIMESTAMP WITH TIME ZONE DEFAULT NULL, -- NOW()
     "verify"             TIMESTAMP WITH TIME ZONE DEFAULT NULL,
     "expire"             TIMESTAMP WITH TIME ZONE DEFAULT NULL,
     "${timeToLiveKey}"   TIMESTAMP WITH TIME ZONE DEFAULT NULL,

     CONSTRAINT ${table}_pkey PRIMARY KEY ("id"),
     CONSTRAINT ${table}_ukey UNIQUE ("sub")
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
