export default (table = "messengers") => {
	return `
  CREATE TABLE IF NOT EXISTS app.messengers
  (
    id                 VARCHAR(11) NOT NULL,
    sub                VARCHAR(11) NOT NULL,

    type               VARCHAR(17) NOT NULL,
    digest             VARCHAR(73) NOT NULL, -- of value
    encryptionKey      VARCHAR(128) NOT NULL,
    value              VARCHAR(128) NOT NULL,

    create             TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    update             TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    verify             TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    expire             TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    remove             TIMESTAMP WITH TIME ZONE DEFAULT NULL,

    CONSTRAINT ${table}_pkey PRIMARY KEY (id)
  );
  `;
};
