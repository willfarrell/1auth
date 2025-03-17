export default (table = "authentications") => {
  return `
  CREATE TABLE IF NOT EXISTS ${table}
  (
    id                 VARCHAR(11) NOT NULL,
    sub                VARCHAR(11) NOT NULL,

    type               VARCHAR(17), -- TODO decrease size
    otp                BOOL         DEFAULT FALSE,
    encryptionKey      VARCHAR(128) NOT NULL,
    value              VARCHAR(128) NOT NULL,

    name               VARCHAR(128) DEFAULT NULL,

    create             TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    update             TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    verify             TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    expire             TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    remove             TIMESTAMP WITH TIME ZONE DEFAULT NULL,

    CONSTRAINT ${table}_pkey PRIMARY KEY (id)
  );
  `;
};
