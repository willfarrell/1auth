export const name = "messengers";
export const timeToLiveKey = "remove";
export const create = async (client, table = name) => {
	const sql = `
	CREATE TABLE IF NOT EXISTS ${table}
   (
     "id"                 VARCHAR(21)         NOT NULL, -- prefix (messenger_) + entropy (11)
     "sub"                VARCHAR(15)         NOT NULL, -- prefix (sub_) + entropy (11)
     "type"               VARCHAR(32)         NOT NULL,

     "encryptionKey"      VARCHAR(256)        NOT NULL,
     "value"              VARCHAR(256) DEFAULT NULL,
     "digest"             VARCHAR(73)  DEFAULT NULL, -- of value

     "name"               VARCHAR(128) DEFAULT NULL,
     "lastused"           TIMESTAMP WITH TIME ZONE DEFAULT NULL,

     "create"             TIMESTAMP WITH TIME ZONE DEFAULT NULL, -- postges: DEFAULT NOW(), sqlite: DEFAULT CURRENT_TIME,
     "update"             TIMESTAMP WITH TIME ZONE DEFAULT NULL, -- NOW()
     "verify"             TIMESTAMP WITH TIME ZONE DEFAULT NULL,
     "expire"             TIMESTAMP WITH TIME ZONE DEFAULT NULL,
     "${timeToLiveKey}"   TIMESTAMP WITH TIME ZONE DEFAULT NULL,

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
