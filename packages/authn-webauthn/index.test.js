import { test, describe, it } from "node:test";
import { ok, equal, deepEqual } from "node:assert/strict";

import * as notify from "../notify-console/index.js";
import * as store from "../store-memory/index.js";
import crypto, {
  symmetricRandomEncryptionKey,
  symmetricRandomSignatureSecret,
  randomChecksumSalt,
  randomChecksumPepper,
  symmetricEncrypt,
  symmetricDecrypt,
} from "../crypto/index.js";

import account, {
  create as accountCreate,
  remove as accountRemove,
  getOptions as accountGetOptions,
} from "../account/index.js";

import accountUsername, {
  create as accountUsernameCreate,
  exists as accountUsernameExists,
} from "../account-username/index.js";

import authn, { getOptions as authnGetOptions } from "../authn/index.js";

import webauthn, {
  // getOptions as webauthnGetOptions,
  authenticate as webauthnAuthenticate,
  create as webauthnCreate,
  verify as webauthnVerify,
  createChallenge as webauthnCreateChallenge,
  count as webauthnCount,
  select as webauthnSelect,
  list as webauthnList,
  expire as webauthnExpire,
  remove as webauthnRemove,
} from "../authn-webauthn/index.js";

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
  log: function () {
    mocks.log(...arguments);
  },
});
const name = "1Auth";
const origin = "http://localhost";
webauthn({
  name,
  origin,
  log: function () {
    mocks.log(...arguments);
  },
});

const mocks = {
  log: () => {},
  notifyClient: () => {},
};
let sub;
const username = "username00";
test.beforeEach(async (t) => {
  sub = await accountCreate();
  await accountUsernameCreate(sub, username);
  t.mock.method(mocks, "notifyClient");
});

test.afterEach(async (t) => {
  t.mock.reset();
  await accountRemove(sub);
  await store.__clear(accountGetOptions().table);
  await store.__clear(authnGetOptions().table);
});

describe("authn-webauthn", () => {
  it("Can create WebAuthn on an account", async () => {
    // Registration
    const { secret: registrationOptions } = await webauthnCreate(sub);

    equal(registrationOptions.challenge.length, 43);
    equal(registrationOptions.rp.name, name);
    equal(registrationOptions.rp.id, origin.substring(7));
    ok(registrationOptions.user.id);
    equal(registrationOptions.user.name, username);
    deepEqual(registrationOptions.authenticatorSelection, {
      residentKey: "preferred",
      userVerification: "preferred",
      // TODO explore why preferred
      // residentKey: 'discouraged',
      // userVerification: 'preferred',
      requireResidentKey: false,
    });
    deepEqual(registrationOptions.excludeCredentials, []);

    let authnDB = await store.selectList(authnGetOptions().table, { sub });
    equal(authnDB.length, 1);
    const token = authnDB[0];
    equal(token.type, "WebAuthn-token");
    equal(token.otp, true);
    equal(token.value.length, 321);
    ok(token.expire);

    await overrideCreateChallenge(sub, token);
    let count = await webauthnCount(sub);
    equal(count, 0);

    await webauthnVerify(sub, registrationResponse, { name: "PassKey" });

    deepEqual(mocks.notifyClient.mock.calls[0].arguments[0], {
      id: "authn-webauthn-create",
      sub,
      data: undefined,
      options: {},
    });

    authnDB = await store.selectList(authnGetOptions().table, { sub });
    equal(authnDB.length, 1);
    const secret = authnDB[0];
    equal(secret.type, "WebAuthn-secret");
    equal(secret.otp, false);
    equal(secret.value.length, 1741);
    equal(secret.expire, undefined);

    count = await webauthnCount(sub);
    equal(count, 1);

    // Authentication
    const { secret: authenticationOptions } =
      await webauthnCreateChallenge(sub);
    equal(authenticationOptions.challenge.length, 43);
    equal(authenticationOptions.rpId, origin.substring(7));
    deepEqual(authenticationOptions.userVerification, "preferred");
    deepEqual(authenticationOptions.allowCredentials, [
      {
        id: registrationResponse.id,
        type: "public-key",
      },
    ]);

    authnDB = await store.selectList(authnGetOptions().table, { sub });
    equal(authnDB.length, 2);
    const challenge = authnDB[1];
    equal(challenge.type, "WebAuthn-challenge");
    equal(challenge.otp, true);
    equal(challenge.value.length, 1977);
    ok(challenge.expire);

    // Override authentication challenge
    await overrideGetChallenge(sub, challenge);

    const userSub = await webauthnAuthenticate(
      username,
      authenticationResponse,
    );
    equal(userSub, sub);

    authnDB = await store.selectList(authnGetOptions().table, { sub });
    equal(authnDB.length, 2);
    authnDB = authnDB.filter((item) => item.expire === undefined);
    equal(authnDB.length, 1);
  });
  it("Can create a 2nd WebAuthn on an account", async () => {
    await webauthnCreate(sub);
    const db0 = await store.selectList(authnGetOptions().table, { sub });
    await overrideCreateChallenge(sub, db0[0]);
    await webauthnVerify(sub, registrationResponse, { name: "PassKey" });

    // TODO finish
    // await webauthnCreate(sub);
    // const [token] = await store.selectList(authnGetOptions().table, { sub });
    // await overrideCreateChallenge(sub, token);
    // await webauthnVerify(sub, registrationResponse, { name: "Yubikey" });

    // let count = await webauthnCount(sub);
    // equal(count, 2);
  });
  it("Can remove WebAuthn on an account", async () => {
    await webauthnCreate(sub);
    const [token] = await store.selectList(authnGetOptions().table, { sub });
    await overrideCreateChallenge(sub, token);
    await webauthnVerify(sub, registrationResponse, { name: "PassKey" });

    await webauthnRemove(sub, token.id);
    let authnDB = await store.selectList(authnGetOptions().table, { sub });
    equal(authnDB.length, 1);
    authnDB = authnDB.filter((item) => item.expire !== undefined);
    equal(authnDB.length, 0);

    // notify
    deepEqual(mocks.notifyClient.mock.calls[1].arguments[0], {
      id: "authn-webauthn-remove",
      sub,
      data: undefined,
      options: {},
    });

    try {
      await webauthnAuthenticate(username, authenticationResponse);
    } catch (e) {
      equal(e.message, "401 Unauthorized");
      deepEqual(e.message, "401 Unauthorized", { cause: "missing" });
    }
  });

  it("Can NOT create a challenge before a credential is verified", async () => {
    await webauthnCreate(sub);
    const { secret } = await webauthnCreateChallenge(sub);

    equal(secret, undefined);
  });
  it("Can NOT remove WebAuthn from someone elses account", async () => {
    const secret = await webauthnCreate(sub);
    const [token] = await store.selectList(authnGetOptions().table, { sub });
    await overrideCreateChallenge(sub, token);
    await webauthnVerify(sub, registrationResponse, { name: "PassKey" }, false);

    await webauthnRemove("sub_1111111", secret.id);
    const authnDB = await store.selectList(authnGetOptions().table, { sub });

    ok(authnDB);
    equal(authnDB.length, 1);
  });
  it("Can select an WebAuthn with { id } (exists)", async () => {
    await webauthnCreate(sub); // TODO id is undefined
    const [token] = await store.selectList(authnGetOptions().table, { sub });
    await overrideCreateChallenge(sub, token);
    const { id } = await webauthnVerify(
      sub,
      registrationResponse,
      { name: "PassKey" },
      false,
    );

    const row = await webauthnSelect(sub, id);
    ok(row);
  });
  it("Can select an WebAuthn with { id } (not exists)", async () => {
    const row = await webauthnSelect(sub, "authn_000");
    equal(row, undefined);
  });

  it("Can list an WebAuthn with { sub } (exists)", async () => {
    await webauthnCreate(sub);
    const [token] = await store.selectList(authnGetOptions().table, { sub });
    await overrideCreateChallenge(sub, token);
    await webauthnVerify(sub, registrationResponse, { name: "PassKey" }, false);
    const row = await webauthnList(sub);
    equal(row.length, 1);
  });
  it("Can list an WebAuthn with { sub } (not exists)", async () => {
    const row = await webauthnList(sub);
    equal(row.length, 0);
  });
});

const registrationOptionsOverride = {
  challenge: "Jl-QJo7l9_InkLl52RE0DLbc3I7sU4IuVJHV1EyHYY4",
  rp: {
    name: "1Auth",
    id: "localhost",
  },
  user: {
    id: "c3ViX0lLN21mb0lMOGJD",
    name: "username00",
    displayName: "",
  },
  pubKeyCredParams: [
    {
      alg: -8,
      type: "public-key",
    },
    {
      alg: -7,
      type: "public-key",
    },
    {
      alg: -257,
      type: "public-key",
    },
  ],
  timeout: 60000,
  attestation: "none",
  excludeCredentials: [],
  authenticatorSelection: {
    residentKey: "preferred",
    userVerification: "preferred",
    requireResidentKey: false,
  },
  extensions: {
    credProps: true,
  },
};
const registrationResponse = {
  id: "9ikDMG-fNBIGo7Ez7_Xx1PGizlo",
  rawId: "9ikDMG-fNBIGo7Ez7_Xx1PGizlo",
  response: {
    attestationObject:
      "o2NmbXRkbm9uZWdhdHRTdG10oGhhdXRoRGF0YViYSZYN5YgOjGh0NBcPZHZgW4_krrmihjLHmVzzuoMdl2NdAAAAAAAAAAAAAAAAAAAAAAAAAAAAFPYpAzBvnzQSBqOxM-_18dTxos5apQECAyYgASFYIHvLwmeIblhH_Tpm7WYjlhnrA3OnL_GL5crvjQI7mjozIlgguEqNjVVHwqmD-QVmXu5ffyvtwhL4-gvD67AtxpjWhlc",
    clientDataJSON:
      "eyJjaGFsbGVuZ2UiOiJKbC1RSm83bDlfSW5rTGw1MlJFMERMYmMzSTdzVTRJdVZKSFYxRXlIWVk0Iiwib3JpZ2luIjoiaHR0cDovL2xvY2FsaG9zdCIsInR5cGUiOiJ3ZWJhdXRobi5jcmVhdGUifQ",
    transports: ["internal"],
    publicKeyAlgorithm: -7,
    publicKey:
      "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEe8vCZ4huWEf9OmbtZiOWGesDc6cv8Yvlyu-NAjuaOjO4So2NVUfCqYP5BWZe7l9_K-3CEvj6C8PrsC3GmNaGVw",
    authenticatorData:
      "SZYN5YgOjGh0NBcPZHZgW4_krrmihjLHmVzzuoMdl2NdAAAAAAAAAAAAAAAAAAAAAAAAAAAAFPYpAzBvnzQSBqOxM-_18dTxos5apQECAyYgASFYIHvLwmeIblhH_Tpm7WYjlhnrA3OnL_GL5crvjQI7mjozIlgguEqNjVVHwqmD-QVmXu5ffyvtwhL4-gvD67AtxpjWhlc",
  },
  type: "public-key",
  clientExtensionResults: {},
  authenticatorAttachment: "platform",
};

const authenticationOptionsOverride = {
  rpId: "localhost",
  challenge: "53kCzYApTbJ5vZnkBYMKMYl76mVfWHL18mSj9cfzjT4",
  allowCredentials: [{ id: registrationResponse.id, type: "public-key" }],
  timeout: 60000,
  userVerification: "preferred",
  extensions: undefined,
};
const authenticationResponse = {
  id: registrationResponse.id,
  rawId: registrationResponse.id,
  response: {
    authenticatorData: "SZYN5YgOjGh0NBcPZHZgW4_krrmihjLHmVzzuoMdl2MdAAAAAA",
    clientDataJSON:
      "eyJjaGFsbGVuZ2UiOiI1M2tDellBcFRiSjV2Wm5rQllNS01ZbDc2bVZmV0hMMThtU2o5Y2Z6alQ0Iiwib3JpZ2luIjoiaHR0cDovL2xvY2FsaG9zdCIsInR5cGUiOiJ3ZWJhdXRobi5nZXQifQ",
    signature:
      "MEYCIQDo7IiSTivehu1vilbW7HpcN3qTVMmBrhuDRmn0apmrswIhAJoJgD-l8QxyeS_ZrlqeagMJO6AFeC6wGdV_r00aZTmm",
    userHandle: "c3ViX0lLN21mb0lMOGJD",
  },
  type: "public-key",
  clientExtensionResults: {},
  authenticatorAttachment: "platform",
};

const overrideCreateChallenge = async (sub, token) => {
  await store.update(
    authnGetOptions().table,
    { sub, id: token.id },
    {
      value: symmetricEncrypt(
        JSON.stringify({
          expectedChallenge: registrationOptionsOverride.challenge,
          expectedOrigin: origin,
          expectedRPID: registrationOptionsOverride.rp.id,
          requireUserVerification: true,
        }),
        {
          sub,
          encryptedKey: token.encryptionKey,
        },
      ),
    },
  );
};

const overrideGetChallenge = async (sub, challenge) => {
  await store.update(
    authnGetOptions().table,
    { sub, id: challenge.id },
    {
      value: symmetricEncrypt(
        JSON.stringify({
          ...JSON.parse(
            symmetricDecrypt(challenge.value, {
              sub,
              encryptedKey: challenge.encryptionKey,
            }),
          ),
          expectedChallenge: authenticationOptionsOverride.challenge,
          expectedOrigin: origin,
          expectedRPID: authenticationOptionsOverride.rpId,
          requireUserVerification: true,
        }),
        {
          sub,
          encryptedKey: challenge.encryptionKey,
        },
      ),
    },
  );
};
