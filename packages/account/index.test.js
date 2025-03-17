import { test, describe, it } from "node:test";
import { ok, equal, notEqual } from "node:assert/strict";

import * as notify from "../notify-console/index.js";
import * as store from "../store-memory/index.js";
import crypto, {
  symmetricRandomEncryptionKey,
  symmetricRandomSignatureSecret,
  randomChecksumSalt,
  randomChecksumPepper,
} from "../crypto/index.js";

import account, {
  create as accountCreate,
  exists as accountExists,
  lookup as accountLookup,
  update as accountUpdate,
  remove as accountRemove,
  getOptions as accountGetOptions,
} from "../account/index.js";

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

const mocks = {
  notifyClient: () => {},
};

test.beforeEach(async (t) => {
  // sub = await accountCreate();
  t.mock.method(mocks, "notifyClient");
});

test.afterEach(async (t) => {
  t.mock.reset();
  // await accountRemove(sub);
  await store.__clear(accountGetOptions().table);
});

describe("account", () => {
  it("Can create an account", async () => {
    const sub = await accountCreate();
    ok(sub);
    const db = await store.select(accountGetOptions().table, { sub });
    ok(db.encryptionKey);
    ok(db.privateKey);
    ok(!db.privateKey.includes("-----BEGIN EC PRIVATE KEY-----")); // encrypted
  });
  it("Can check if an account exists using { sub } (exists)", async () => {
    const sub = await accountCreate();
    const user = await accountExists(sub);
    ok(user);
  });
  it("Can check if an account exists using { sub } (not exists)", async () => {
    const user = await accountExists("sub_000000000");
    equal(user, undefined);
  });
  it("Can lookup an account using { sub } (exists)", async () => {
    const sub = await accountCreate();
    const user = await accountLookup(sub);
    ok(user.id);
    equal(user.encryptionKey, undefined);
    equal(user.privateKey, undefined);
  });
  it("Can lookup an account using { sub } (not exists)", async () => {
    const user = await accountLookup("sub_000000");
    equal(user, undefined);
  });
  it("Can add `name` to account (encrypted)", async () => {
    const name = "Real name";
    const sub = await accountCreate();
    await accountUpdate(sub, { name });
    const user = await accountLookup(sub);
    equal(user.name, name);

    const db = await store.select(accountGetOptions().table, { sub });
    notEqual(db.name, user.name); // encrypted
  });
  it("Can add `alias` to account (unencrypted)", async () => {
    const alias = "Alias";
    const sub = await accountCreate();
    await accountUpdate(sub, { alias });
    const user = await accountLookup(sub);
    equal(user.alias, alias);

    const db = await store.select(accountGetOptions().table, { sub });
    equal(db.alias, user.alias); // unencrypted
  });
  it("Can delete an account", async () => {
    const sub = await accountCreate();
    await accountRemove(sub);
    const user = await store.select(accountGetOptions().table, { sub });
    equal(user, undefined);
  });
});
