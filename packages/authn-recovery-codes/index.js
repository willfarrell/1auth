import {
  charactersAlphaNumeric,
  entropyToCharacterLength,
  randomAlphaNumeric,
  createSecretHash,
  verifySecretHash,
} from "@1auth/crypto";
import {
  getOptions as authnGetOptions,
  count as authnCount,
  list as authnList,
  // create as authnCreate,
  createList as authnCreateList,
  authenticate as authnAuthenticate,
  remove as authnRemove,
} from "@1auth/authn";

// aka lookup secret
const id = "recoveryCodes";

const secret = {
  id,
  type: "secret",
  minLength: entropyToCharacterLength(112, charactersAlphaNumeric.length),
  otp: true,
  create: async () => randomAlphaNumeric(secret.minLength),
  encode: async (value) => createSecretHash(value),
  decode: async (value) => value,
  verify: async (value, hash) => verifySecretHash(hash, value),
};

const defaults = {
  id,
  secret,
  count: 5,
};
const options = {};
export default (opt = {}) => {
  Object.assign(options, authnGetOptions(), defaults, opt);
};

export const count = async (sub) => {
  if (options.log) {
    options.log("@1auth/authn-recovery-codes count(", sub, ")");
  }
  return await authnCount(options.secret, sub);
};

export const list = async (sub) => {
  if (options.log) {
    options.log("@1auth/authn-recovery-codes list(", sub, ")");
  }
  return await authnList(options.secret, sub);
};

export const authenticate = async (username, secret) => {
  return await authnAuthenticate(options.secret, username, secret);
};

export const create = async (sub) => {
  if (options.log) {
    options.log("@1auth/authn-recovery-codes create(", sub, ")");
  }
  const secrets = await createSecrets(sub, options.count);
  await options.notify.trigger("authn-recovery-codes-create", sub);
  return secrets;
};

export const update = async (sub) => {
  if (options.log) {
    options.log("@1auth/authn-recovery-codes update(", sub, ")");
  }
  const existingSecrets = await options.store.selectList(options.table, {
    sub,
    type: options.secret.id + "-" + options.secret.type,
  });
  const secrets = await createSecrets(sub, options.count);

  const id = existingSecrets.map((item) => item.id);
  await authnRemove(options.secret, sub, id);

  await options.notify.trigger("authn-recovery-codes-update", sub);
  return secrets;
};

export const remove = async (sub, id) => {
  if (options.log) {
    options.log("@1auth/authn-recovery-codes remove(", sub, id, ")");
  }

  id ??= await options.store
    .selectList(options.table, {
      sub,
      type: options.id + "-" + options.secret.type,
    })
    .then((res) => res.map((item) => item.id));

  await authnRemove(options.secret, sub, id);

  await options.notify.trigger("authn-recovery-codes-remove", sub);
};

const createSecrets = async (sub, count = options.count) => {
  const secrets = [];
  const now = nowInSeconds();
  for (let i = count; i--; ) {
    const secret = await options.secret.create();
    secrets.push({
      value: secret,
      verify: now,
    });
  }
  await authnCreateList(options.secret, sub, secrets);
  return secrets;
};

const nowInSeconds = () => Math.floor(Date.now() / 1000);
