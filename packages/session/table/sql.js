export default (table = 'sessions') => {
  return `
  CREATE TABLE IF NOT EXISTS ${table}
  (
    "id"                 VARCHAR(21)  NOT NULL,
    "sub"                VARCHAR(11)  NOT NULL,

    "encryptionKey"      VARCHAR(128) NOT NULL,
    "value"              VARCHAR(256) NOT NULL,

    "create"             TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    "update"             TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    "verify"             TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    "expire"             TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    "remove"             TIMESTAMP WITH TIME ZONE DEFAULT NULL,

    CONSTRAINT ${table}_pkey PRIMARY KEY ("id")
  );
  `
}
