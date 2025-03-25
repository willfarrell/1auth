import { test } from "node:test";
import fc from "fast-check";

// *** Setup Start *** //
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
} from "../account-username/index.js";

import authn from "../authn/index.js";

import recoveryCodes, {
  authenticate as recoveryCodesAuthenticate,
  create as recoveryCodesCreate,
} from "../authn-recovery-codes/index.js";

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
accountUsername();

authn({
  store,
  notify,
  usernameExists: [accountUsernameExists],
  encryptedFields: ["value", "name"],
  authenticationDuration: 0,
});
recoveryCodes({ count: 1 });
// *** Setup End *** //

const mocks = { notifyClient: () => {} };

const sub = await accountCreate();
const username = "username";

await accountUsernameCreate(sub, username);
await recoveryCodesCreate(sub);

const catchError = (input, e) => {
  if (e.message === "401 Unauthorized") {
    return;
  }
  console.error(input, e);
  throw e;
};

test("fuzz recoveryCodesAuthenticate w/ `string`", async () => {
  await fc.assert(
    fc.asyncProperty(fc.string(), async (secret) => {
      try {
        await recoveryCodesAuthenticate(username, secret);
      } catch (e) {
        catchError(secret, e);
      }
    }),
    {
      numRuns: 10,
      verbose: 2,
      examples: [],
    },
  );
});
