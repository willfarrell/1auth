import {
  charactersAlphaNumeric,
  entropyToCharacterLength,
  randomAlphaNumeric,
  createEncryptedDigest,
  symmetricGenerateEncryptionKey,
  symmetricEncrypt,
  symmetricDecrypt,
  symmetricSignatureSign,
  symmetricSignatureVerify,
  safeEqual
} from '@1auth/crypto'

const id = 'session'
const randomId = {
  id,
  type: 'id',
  minLength: entropyToCharacterLength(128, charactersAlphaNumeric.length), // ASVS 3.2.2
  expire: 15 * 60,
  create: async (prefix) =>
    (prefix ? prefix + '_' : '') + randomAlphaNumeric(randomId.minLength)
}
const randomSessionId = {
  id,
  type: 'id',
  minLength: entropyToCharacterLength(128, charactersAlphaNumeric.length), // ASVS 3.2.2
  expire: 15 * 60,
  create: async (prefix) =>
    (prefix ? prefix + '_' : '') +
    randomAlphaNumeric(randomSessionId.minLength)
}

const defaults = {
  id,
  log: false,
  store: undefined,
  notify: undefined,
  table: 'sessions',
  idGenerate: true, // turn off to allow DB to handle
  idPrefix: 'session',
  randomId,
  randomSessionId,
  expire: randomId.expire,
  // encryptedFields: ["value"],
  encode: (value) => JSON.stringify(value),
  decode: (value) => JSON.parse(value),
  checkMetadata: (oldSession, newSession) => safeEqual(oldSession, newSession)
}
const options = {}
export default (opt = {}) => {
  Object.assign(options, defaults, opt)
}
export const getOptions = () => options

// pass value: null to skip metadata check
export const lookup = async (sid, value = {}) => {
  const digest = createEncryptedDigest(sid)
  const session = await options.store.select(options.table, { digest })
  if (session) {
    const now = nowInSeconds()
    if (session.expire < now) {
      return
    }
    if (value === null) {
      return session
    }
    const encodedValue = options.encode(value)
    const decryptedValue = symmetricDecrypt(session.value, {
      sub: session.sub,
      encryptedKey: session.encryptionKey
    })
    if (options.checkMetadata(decryptedValue, encodedValue)) {
      return session
    }
  }
}

export const list = async (sub) => {
  const now = nowInSeconds()
  const items = await options.store.selectList(options.table, { sub })

  const sessions = []
  for (let i = items.length; i--;) {
    const item = items[i]
    if (item.expire < now) {
      continue
    }
    const decryptedValue = symmetricDecrypt(item.value, {
      sub,
      encryptedKey: item.encryptionKey
    })
    item.value = options.decode(decryptedValue)
    sessions.push(item)
  }
  return sessions
}

/**
 * Session Create
 * @param sub
 * @param value {os, browser, ip, ...}
 */
export const create = async (sub, value = {}) => {
  if (options.log) {
    options.log('@1auth/session create(', sub, value, ')')
  }
  const now = nowInSeconds()
  const sid = await options.randomSessionId.create()
  const digest = createEncryptedDigest(sid)
  const params = {
    digest,
    sub,
    create: now,
    update: now,
    expire: now + options.expire
  }
  if (options.idGenerate) {
    params.id = await options.randomId.create(options.idPrefix)
  }
  const encodedValue = options.encode(value)

  const { encryptedKey, encryptionKey } = symmetricGenerateEncryptionKey(sub)
  params.encryptionKey = encryptedKey
  params.value = symmetricEncrypt(encodedValue, {
    encryptionKey,
    sub
  })
  // if (options.log) {
  //   options.log("@1auth/session create", { params });
  // }
  await options.store.insert(options.table, params)
  params.sid = sid
  return params
}

// Before creating a new session, check if metadata is new
export const check = async (sub, value) => {
  const encodedValue = options.encode(value)
  const sessions = await options.store.selectList(options.table, { sub })
  for (const session of sessions) {
    const decryptedValue = symmetricDecrypt(session.value, {
      sub,
      encryptedKey: session.encryptionKey
    })
    if (options.checkMetadata(decryptedValue, encodedValue)) {
      return
    }
  }
  options.notify.trigger('authn-session-new-device', sub)
}

export const expire = async (sub, id) => {
  const now = nowInSeconds()
  await options.store.update(
    options.table,
    { sub, id },
    { update: now, expire: now - 1 }
  )
}

export const remove = async (sub, id) => {
  await options.store.remove(options.table, { sub, id })
}

export const sign = (id) => {
  return symmetricSignatureSign(id)
}

export const verify = (id) => {
  return symmetricSignatureVerify(id)
}

// guest or onboard session to authenticated
// export const rotate = async (sub, meta) => {
//   await remove()
//   return create()
// }
const nowInSeconds = () => Math.floor(Date.now() / 1000)
