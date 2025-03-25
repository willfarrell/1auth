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

import authn from "../authn/index.js";

import messenger from "../messenger/index.js";
import emailAddress, {
  lookup as emailAddressLookup,
  create as emailAddressCreate,
} from "../messenger-email-address/index.js";

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
authn({ store, notify, authenticationDuration: 0 });
messenger({ store, notify });
emailAddress();
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

test("fuzz emailAddressCreate w/ `string`", async () => {
  await fc.assert(
    fc.asyncProperty(fc.emailAddress(), async (emailAddress) => {
      try {
        await emailAddressCreate(sub, emailAddress);
      } catch (e) {
        catchError(emailAddress, e);
      }
    }),
    {
      numRuns: 100_000,
      verbose: 2,
      examples: [],
    },
  );
});

test("fuzz emailAddressCreate w/ `string`", async () => {
  await fc.assert(
    fc.asyncProperty(fc.string(), async (emailAddress) => {
      try {
        await emailAddressCreate(sub, emailAddress);
      } catch (e) {
        catchError(emailAddress, e);
      }
    }),
    {
      numRuns: 100_000,
      verbose: 2,
      examples: [],
    },
  );
});

test("fuzz emailAddressLookup w/ `string`", async () => {
  await fc.assert(
    fc.asyncProperty(fc.string(), async (emailAddress) => {
      try {
        await emailAddressLookup(emailAddress);
      } catch (e) {
        catchError(emailAddress, e);
      }
    }),
    {
      numRuns: 100_000,
      verbose: 2,
      examples: [],
    },
  );
});
