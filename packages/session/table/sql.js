export const name = "sessions";
export const timeToLiveKey = "remove";
export const create = async (client, table = name) => {
	const sql = `
  CREATE TABLE IF NOT EXISTS ${table}
  (
    "id"                 VARCHAR(19)   NOT NULL, -- prefix (session_) + entropy (11)
    "sub"                VARCHAR(15)   NOT NULL, -- prefix (sub_) + entropy (11)

    "encryptionKey"      VARCHAR(256)  NOT NULL,
    "value"              VARCHAR(256)  NOT NULL,
    "digest"             VARCHAR(256)  NOT NULL,
    "metadata"           VARCHAR(256)  DEFAULT NULL, -- optional, used in tests

    "create"             TIMESTAMP WITH TIME ZONE DEFAULT NULL, -- NOW()
    "update"             TIMESTAMP WITH TIME ZONE DEFAULT NULL, -- NOW()
    "verify"             TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    "expire"             TIMESTAMP WITH TIME ZONE DEFAULT NULL, -- (NOW() + interval '12 hour'),
    "${timeToLiveKey}"   TIMESTAMP WITH TIME ZONE DEFAULT NULL, -- (NOW() + interval '12 hour' + interval '10 days'),

    CONSTRAINT ${table}_pkey PRIMARY KEY ("id"),
    CONSTRAINT ${table}_ukey UNIQUE ("digest")
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
