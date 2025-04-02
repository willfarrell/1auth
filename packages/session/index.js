import {
  makeRandomConfigObject,
  createSeasonedDigest,
  symmetricGenerateEncryptionKey,
  symmetricEncrypt,
  symmetricDecrypt,
  symmetricSignatureSign,
  symmetricSignatureVerify,
  safeEqual,
} from "@1auth/crypto";

const id = "session";

export const randomId = ({ prefix = "session_", ...params } = {}) =>
  makeRandomConfigObject({
    id,
    prefix,
    ...params,
  });
export const randomSessionId = ({
  prefix = "sid_",
  entropy = 128,
  expire = 15 * 60,
  ...params
} = {}) =>
  makeRandomConfigObject({
    id,
    prefix,
    entropy,
    expire,
    ...params,
  });

const defaults = {
  id,
  log: false,
  store: undefined,
  notify: undefined,
  table: "sessions",
  idGenerate: true, // turn off to allow DB to handle
  randomId: randomId(),
  randomSessionId: randomSessionId(),
  expire: 15 * 60,
  // encryptedFields: ["value"],
  encode: (value) => JSON.stringify(value),
  decode: (value) => JSON.parse(value),
  checkMetadata: (oldSession, newSession) => safeEqual(oldSession, newSession),
};
const options = {};
export default (opt = {}) => {
  Object.assign(options, defaults, opt);
};
export const getOptions = () => options;

export const lookup = async (sid, value = {}) => {
  const digest = createSeasonedDigest(sid);
  const session = await options.store.select(options.table, { digest });
  if (session) {
    const now = nowInSeconds();
    if (session.expire < now) {
      return;
    }
    const encodedValue = options.encode(value);
    const decryptedValue = symmetricDecrypt(session.value, {
      sub: session.sub,
      encryptedKey: session.encryptionKey,
    });
    if (options.checkMetadata(decryptedValue, encodedValue)) {
      return session;
    }
  }
};

export const select = async (sub, id) => {
  const session = await options.store.select(options.table, { sub, id });
  const now = nowInSeconds();
  if (session) {
    const decryptedValue = symmetricDecrypt(session.value, {
      sub,
      encryptedKey: session.encryptionKey,
    });
    session.value = options.decode(decryptedValue);
    return session;
  }
};

export const list = async (sub) => {
  const items = await options.store.selectList(options.table, { sub });
  const now = nowInSeconds();
  const sessions = [];
  for (let i = items.length; i--; ) {
    const session = items[i];
    const decryptedValue = symmetricDecrypt(session.value, {
      sub,
      encryptedKey: session.encryptionKey,
    });
    session.value = options.decode(decryptedValue);
    sessions.push(session);
  }
  return sessions;
};

/**
 * Session Create
 * @param sub
 * @param value {os, browser, ip, ...}
 */
export const create = async (sub, value = {}) => {
  if (options.log) {
    options.log("@1auth/session create(", sub, value, ")");
  }
  const now = nowInSeconds();
  const sid = await options.randomSessionId.create();
  const digest = createSeasonedDigest(sid);
  const params = {
    digest,
    sub,
    create: now,
    update: now,
    expire: now + options.expire,
  };
  if (options.idGenerate) {
    params.id = await options.randomId.create(options.idPrefix);
  }
  const encodedValue = options.encode(value);

  const { encryptedKey, encryptionKey } = symmetricGenerateEncryptionKey(sub);
  params.encryptionKey = encryptedKey;
  params.value = symmetricEncrypt(encodedValue, {
    encryptionKey,
    sub,
  });
  // if (options.log) {
  //   options.log("@1auth/session create", { params });
  // }
  await options.store.insert(options.table, params);
  params.sid = sid;
  return params;
};

// Before creating a new session, check if metadata is new
export const check = async (sub, value = {}) => {
  const encodedValue = options.encode(value);
  const sessions = await options.store.selectList(options.table, { sub });
  for (const session of sessions) {
    const decryptedValue = symmetricDecrypt(session.value, {
      sub,
      encryptedKey: session.encryptionKey,
    });
    if (options.checkMetadata(decryptedValue, encodedValue)) {
      return;
    }
  }
  options.notify.trigger("authn-session-new-device", sub);
};

export const expire = async (sub, id) => {
  const now = nowInSeconds();
  await options.store.update(
    options.table,
    { sub, id },
    { update: now, expire: now - 1 },
  );
};

export const remove = async (sub, id) => {
  await options.store.remove(options.table, { sub, id });
};

export const sign = (id) => {
  return symmetricSignatureSign(id);
};

export const verify = (idWithSignature) => {
  return symmetricSignatureVerify(idWithSignature);
};

// guest or onboard session to authenticated
// export const rotate = async (sub, meta) => {
//   await remove()
//   return create()
// }
const nowInSeconds = () => Math.floor(Date.now() / 1000);
