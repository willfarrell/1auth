import { test } from "node:test";
import fc from "fast-check";

// ** Setup Start *** //
import * as notify from "../notify-console/index.js";
import * as store from "../store-memory/index.js";
import crypto, {
  symmetricRandomEncryptionKey,
  symmetricRandomSignatureSecret,
  randomChecksumSalt,
  randomChecksumPepper,
} from "../crypto/index.js";

import account, { create as accountCreate } from "../account/index.js";

import accountUsername, {
  create as accountUsernameCreate,
  exists as accountUsernameExists,
  lookup as accountUsernameLookup,
  update as accountUsernameUpdate,
} from "../account-username/index.js";

crypto({
  symmetricEncryptionKey: symmetricRandomEncryptionKey(),
  symmetricSignatureSecret: symmetricRandomSignatureSecret(),
  digestChecksumSalt: randomChecksumSalt(),
  digestChecksumPepper: randomChecksumPepper(),
});
store.default({ log: false });
notify.default({
  client: (id, sub, params) => {
    mocks.notifyClient(id, sub, params);
  },
});

account({ store, notify, encryptedFields: ["name", "username", "privateKey"] });
accountUsername({
  usernameBlacklist: ["admin"],
});
// *** Setup End *** //

const mocks = { notifyClient: () => {} };

const sub = await accountCreate();

const catchError = (input, e) => {
  if (e.message === "400 Bad Request") {
    return;
  } else if (e.message === "409 Conflict") {
    return;
  }
  console.error(input, e);
  throw e;
};

test("fuzz accountUsernameCreate w/ `string`", async () => {
  fc.assert(
    fc.asyncProperty(fc.string(), async (username) => {
      try {
        await accountUsernameCreate(sub, username);
      } catch (e) {
        catchError(username, e);
      }
    }),
    {
      numRuns: 1_000_000,
      verbose: 2,
      examples: [],
    },
  );
});

test("fuzz accountUsernameExists w/ `string`", async () => {
  fc.assert(
    fc.asyncProperty(fc.string(), async (username) => {
      try {
        await accountUsernameExists(sub, username);
      } catch (e) {
        catchError(username, e);
      }
    }),
    {
      numRuns: 1_000_000,
      verbose: 2,
      examples: [],
    },
  );
});

test("fuzz accountUsernameLookup w/ `string`", async () => {
  fc.assert(
    fc.asyncProperty(fc.string(), async (username) => {
      try {
        await accountUsernameLookup(sub, username);
      } catch (e) {
        catchError(username, e);
      }
    }),
    {
      numRuns: 1_000_000,
      verbose: 2,
      examples: [],
    },
  );
});

test("fuzz accountUsernameUpdate w/ `string`", async () => {
  fc.assert(
    fc.asyncProperty(fc.string(), async (username) => {
      try {
        await accountUsernameUpdate(sub, username);
      } catch (e) {
        catchError(username, e);
      }
    }),
    {
      numRuns: 1_000_000,
      verbose: 2,
      examples: [],
    },
  );
});
