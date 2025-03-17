import { test } from "node:test";
import fc from "fast-check";

// ** Setup Start *** //
import * as notify from "../notify-console/index.js";
import * as store from "../store-memory/index.js";
import crypto, {
  symmetricRandomEncryptionKey,
  symmetricRandomSignatureSecret,
} from "../crypto/index.js";

import account, {
  create as accountCreate,
  update as accountUpdate,
} from "../account/index.js";

crypto({
  symmetricEncryptionKey: symmetricRandomEncryptionKey(),
  symmetricSignatureSecret: symmetricRandomSignatureSecret(),
  digestChecksumSalt: randomChecksumSalt(),
  digestChecksumPepper: randomChecksumPepper(),
});
store.default({ log: false });
notify.default({
  client: (id, sub, params) => {},
});

account({ store, notify, encryptedFields: ["name", "username", "privateKey"] });
// *** Setup End *** //

const sub = await accountCreate();

test("fuzz accountUpdate encrypted value w/ `string`", async () => {
  fc.assert(
    fc.asyncProperty(fc.string(), async (name) => {
      await accountUpdate(sub, { name });
    }),
    {
      numRuns: 100_000,
      verbose: 2,
      examples: [],
    },
  );
});

test("fuzz accountUpdate unencrypted value w/ `string`", async () => {
  fc.assert(
    fc.asyncProperty(fc.string(), async (notPersonalInformation) => {
      await accountUpdate(sub, { notPersonalInformation });
    }),
    {
      numRuns: 100_000,
      verbose: 2,
      examples: [],
    },
  );
});
