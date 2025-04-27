export const name = "test";
export const timeToLiveKey = "remove";
export const create = async (client, table = name) => {
	const sql = `
  CREATE TABLE IF NOT EXISTS ${table}
  (
    "id"     SERIAL PRIMARY KEY,
    "sub"    VARCHAR(15)              NOT NULL,
    "value"  VARCHAR(256)             NOT NULL,
    "digest" VARCHAR(256)             DEFAULT NULL,

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
    DROP TABLE ${table};
  `;
	return await client.query(sql);
};

export const emptyRow = () => ({
	id: 0,
	sub: null,
	value: null,
	digest: null,
	expire: null,
	remove: null,
});
