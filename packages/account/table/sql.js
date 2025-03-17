export default (table = "accounts") => {
  return `
  CREATE TABLE IF NOT EXISTS ${table}
  (
    sub                VARCHAR(11)         NOT NULL,

    privateKey         VARCHAR(128)        NOT NULL,
    digest             VARCHAR(73) DEFAULT NULL, -- of username
    encryptionKey      VARCHAR(128)        NOT NULL,
    publicKey          VARCHAR(128)        NOT NULL,
    username           VARCHAR(128) DEFAULT NULL,

    locale             VARCHAR(128) NOT NULL,
    name               VARCHAR(128) DEFAULT NULL,

    create             TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    update             TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    verify             TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    expire             TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    remove             TIMESTAMP WITH TIME ZONE DEFAULT NULL,

    CONSTRAINT ${table}_pkey PRIMARY KEY (sub)
    -- CONSTRAINT ${table}_ukey PRIMARY KEY (digest)
  );
  `;
};
