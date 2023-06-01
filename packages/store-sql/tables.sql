
CREATE TABLE IF NOT EXISTS app.accounts
(
  sub                VARCHAR(11) PRIMARY KEY,
  state              VARCHAR(17), -- TODO decrease size
  --notification JSONB
  encryptionKey      VARCHAR(128)                      NOT NULL,
  privateKey         VARCHAR(128)                      NOT NULL,
  publicKey         VARCHAR(128)                      NOT NULL,
  username       VARCHAR(128) DEFAULT NULL,
  digest         VARCHAR(73) DEFAULT NULL, -- of username
  name               VARCHAR(128) DEFAULT NULL,
  locale             VARCHAR(5) NOT NULL,
  agreementTermsOfUse TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  create             TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  update             TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  verify             TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  verifySub          VARCHAR(128),
  expire             TIMESTAMP WITH TIME ZONE DEFAULT NULL,
);

DO
$$
  BEGIN
  -- CREATE INDEX IF NOT EXISTS accounts_sub_idx ON app.accounts (sub); -- PRIMARY KEY
  CREATE INDEX IF NOT EXISTS accounts_digest_idx ON app.accounts (digest);
  END;
$$;

CREATE TABLE IF NOT EXISTS app.credentials
(
  id                VARCHAR(11) PRIMARY KEY,
  sub                VARCHAR(11),
  type              VARCHAR(17), -- TODO decrease size

  encryptionKey      VARCHAR(128)                      NOT NULL,
  challenge       VARCHAR(128) DEFAULT NULL,
  name               VARCHAR(128) DEFAULT NULL,
  otp                BOOL DEFAULT FALSE, 
  value              VARCHAR(128) NOT NULL
  create             TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  update             TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  verify             TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  expire             TIMESTAMP WITH TIME ZONE DEFAULT NULL,
);

DO
$$
  BEGIN
  
  CREATE INDEX IF NOT EXISTS credentials_sub_idx ON app.credentials (sub);
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname = 'credentials_sub_fkey') THEN
    ALTER TABLE app.credentials
      ADD CONSTRAINT credentials_sub_fkey
        FOREIGN KEY (sub) REFERENCES app.accounts (sub);
  END IF;
  
  CREATE INDEX IF NOT EXISTS credentials_type_idx ON app.credentials (type);
  
  END;
$$;


CREATE TABLE IF NOT EXISTS app.messengers
(
  id                VARCHAR(11) PRIMARY KEY,
  sub                VARCHAR(11),
  type              VARCHAR(17), -- TODO decrease size

  encryptionKey      VARCHAR(128)                      NOT NULL,
  
  value              VARCHAR(128) NOT NULL,
  digest           VARCHAR(73) NOT NULL, -- of value
  create             TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  update             TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  verify             TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  expire             TIMESTAMP WITH TIME ZONE DEFAULT NULL,
);

DO
$$
  BEGIN
  
  CREATE INDEX IF NOT EXISTS messengers_sub_idx ON app.messengers (sub);
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname = 'messengers_sub_fkey') THEN
    ALTER TABLE app.messengers
      ADD CONSTRAINT messengers_sub_fkey
        FOREIGN KEY (sub) REFERENCES app.accounts (sub);
  END IF;
  
  CREATE INDEX IF NOT EXISTS messengers_type_idx ON app.messengers (type);
  CREATE INDEX IF NOT EXISTS messengers_digest_idx ON app.messengers (digest);
  
  END;
$$;

CREATE TABLE IF NOT EXISTS app.sessions
(
  id                VARCHAR(21) PRIMARY KEY,
  sub                VARCHAR(11),

  encryptionKey      VARCHAR(128)                      NOT NULL,
  
  value              VARCHAR(256) NOT NULL,
  
  create             TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  update             TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  verify             TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  expire             TIMESTAMP WITH TIME ZONE DEFAULT NULL,
);

DO
$$
  BEGIN
  
  CREATE INDEX IF NOT EXISTS sessions_sub_idx ON app.sessions (sub);
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname = 'sessions_sub_fkey') THEN
    ALTER TABLE app.sessions
      ADD CONSTRAINT sessions_sub_fkey
        FOREIGN KEY (sub) REFERENCES app.accounts (sub);
  END IF;
  
  
  END;
$$;

