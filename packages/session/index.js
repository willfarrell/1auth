import {
  charactersAlphaNumeric,
  entropyToCharacterLength,
  randomAlphaNumeric,
  makeSymetricKey,
  symetricEncrypt,
  symetricDecrypt
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

const defaults = {
  id,
  log: false,
  store: undefined,
  notify: undefined,
  table: 'sessions',
  idGenerate: true, // turn off to allow DB to handle
  idPrefix: 'session',
  randomId,
  expire: randomId.expire,
  // encryptedFields: ["value"],
  encode: (value) => JSON.stringify(value),
  decode: (value) => JSON.parse(value),
  checkMetadata: (oldSession, newSession) => oldSession === newSession
}
const options = {}
export default (opt = {}) => {
  Object.assign(options, defaults, opt)
}
export const getOptions = () => options

export const lookup = async (id, value = {}) => {
  const session = await options.store.select(options.table, { id })
  if (session) {
    const now = nowInSeconds()
    if (session.expire < now) {
      return
    }
    const encodedValue = options.encode(value)
    const decryptedValue = symetricDecrypt(session.value, {
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
    if (items[i].expire < now) {
      continue
    }
    const decryptedValue = symetricDecrypt(items[i].value, {
      sub,
      encryptedKey: items[i].encryptionKey
    })
    items[i].value = options.decode(decryptedValue)
    sessions.push(items[i])
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
  const params = {
    sub,
    create: now,
    update: now,
    expire: now + options.expire
  }
  if (options.idGenerate) {
    params.id = await options.randomId.create(options.idPrefix)
  }

  const { encryptedKey, encryptionKey } = makeSymetricKey(sub)
  params.encryptionKey = encryptedKey
  const encodedValue = options.encode(value)
  params.value = symetricEncrypt(encodedValue, {
    encryptionKey,
    sub
  })
  // if (options.log) {
  //   options.log("@1auth/session create", { params });
  // }
  await options.store.insert(options.table, params)

  return params
}

// Before creating a new session, check if metadata is new
export const check = async (sub, value) => {
  const encodedValue = options.encode(value)
  const sessions = await options.store.selectList(options.table, { sub })
  for (const session of sessions) {
    const decryptedValue = symetricDecrypt(session.value, {
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
  await options.store.update(
    options.table,
    { sub, id },
    { expire: nowInSeconds() - 1 }
  )
}

export const remove = async (sub, id) => {
  await options.store.remove(options.table, { sub, id })
}

// guest or onboard session to authenticated
// export const rotate = async (sub, meta) => {
//   await remove()
//   return create()
// }
const nowInSeconds = () => Math.floor(Date.now() / 1000)
