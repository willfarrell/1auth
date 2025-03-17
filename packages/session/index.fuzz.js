import { test } from "node:test";
import fc from "fast-check";

// *** Setup Start *** //
import * as notify from "../notify-console/index.js";
import * as store from "../store-sql/index.js"; // SQL used to prevent running out of memory

import * as mockStoreSQL from "../store-sql/mock.sqlite.js";
import accountSQLTable from "../account/table/sql.js";
import sessionSQLTable from "../session/table/sql.js";

import crypto, {
  symmetricRandomEncryptionKey,
  symmetricRandomSignatureSecret,
  randomChecksumSalt,
  randomChecksumPepper,
} from "../crypto/index.js";

import account, {
  getOptions as accountGetOptions,
  create as accountCreate,
} from "../account/index.js";

import accountUsername, {
  exists as accountUsernameExists,
} from "../account-username/index.js";

import authn from "../authn/index.js";

import session, {
  getOptions as sessionGetOptions,
  create as sessionCreate,
  check as sessionCheck,
  lookup as sessionLookup,
} from "../session/index.js";

crypto({
  symmetricEncryptionKey: symmetricRandomEncryptionKey(),
  symmetricSignatureSecret: symmetricRandomSignatureSecret(),
  digestChecksumSalt: randomChecksumSalt(),
  digestChecksumPepper: randomChecksumPepper(),
});
notify.default({
  client: (id, sub, params) => {
    mocks.notifyClient(id, sub, params);
  },
});

store.default({
  log: false, // mockStoreSQL.log,
  query: mockStoreSQL.query,
});
await store.__table(accountSQLTable(accountGetOptions().table));
await store.__table(sessionSQLTable(sessionGetOptions().table));

account({
  store,
  notify,
  encryptedFields: ["name", "username", "privateKey"],
});
accountUsername();

authn({
  store,
  notify,
  usernameExists: [accountUsernameExists],
  encryptedFields: ["value", "name"],
});
session({ store, notify });
// *** Setup End *** //

const mocks = { notifyClient: () => {} };

const sub = await accountCreate();
const { sid } = await sessionCreate(sub, {});

test("fuzz sessionLookup w/ `object`", async () => {
  fc.assert(
    fc.asyncProperty(fc.object(), async (currentDevice) => {
      await sessionLookup(sid, currentDevice);
    }),
    {
      numRuns: 1_000_000,
      verbose: 2,
      examples: [],
    },
  );
});

test("fuzz sessionCheck w/ `object`", async () => {
  fc.assert(
    fc.asyncProperty(fc.object(), async (currentDevice) => {
      await sessionCheck(sub, currentDevice);
    }),
    {
      numRuns: 1_000_000,
      verbose: 2,
      examples: [],
    },
  );
});

// test('fuzz sessionCreate w/ `object`', async () => {
//   fc.assert(
//     fc.asyncProperty(fc.object(), async (currentDevice) => {
//       await sessionCreate(sub, currentDevice)
//     }),
//     {
//       numRuns: 1_000_000,
//       verbose: 2,
//       examples: []
//     }
//   )
// })
