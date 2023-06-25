import { session, makeSymetricKey, encrypt } from '@1auth/crypto'

const options = {
  store: undefined,
  notify: undefined,
  table: 'sessions',
  cache: true,
  expire: session.expire,
  checkMetadata: (oldSession, newSession) =>
    JSON.stringify(oldSession) === JSON.stringify(newSession)
}
const cache = {}

export default (params) => {
  Object.assign(options, { id: session }, params)
}

/**
 * Session Create
 * @param sub
 * @param value {os, browser, ip}
 * @returns {Promise<*&{sub, create: number, update: number, id: *}>}
 */
export const create = async (sub, value = {}) => {
  const id = await options.id.create()
  const now = nowInSeconds()
  const params = {
    id,
    sub,
    create: now,
    update: now,
    expire: now + options.expire
  }
  if (options.cache) {
    cache[id] = { sub, expire: params.expire }
  }

  if (value) {
    const { encryptedKey } = makeSymetricKey(sub)
    params.encryptionKey = encryptedKey
    params.value = encrypt(JSON.stringify(value), encryptedKey, sub)
  }

  await options.store.insert(options.table, params)

  return params
}

// Before creating a new session, check if metadata is new
export const check = async (sub, value) => {
  const sessions = await list(sub)
  for (const session of sessions) {
    if (options.checkMetadata(session.value, value)) {
      return
    }
  }
  options.notify.trigger('authn-session-new-device', sub)
}

export const lookup = async (id, meta) => {
  const now = nowInSeconds()
  let session
  if (id) {
    session = cache[id]
    session ??= await options.store.select(options.table, { id })
    if (session.expire < now) {
      return
    }
  }
  // session ??= await options.id.create(null, meta)

  /* let authToken // TODO return JWT or IAM to be passed around
  if (session.sub) {
    const account = await accountLookup(session.sub)
    authToken = account
  } else {
    authToken = session
  }
  return authToken */
  return session
}

export const list = async (sub) => {
  const now = nowInSeconds()
  return options.store
    .selectList(options.table, { sub, type: undefined })
    .then((items) =>
      items
        .filter((item) => item.expire > now)
        .map((item) => {
          item.value = JSON.parse(item.value)
          return item
        })
    )
}

export const expire = async (id) => {
  await options.store.update(
    options.table,
    { id },
    { expire: nowInSeconds() - 1 }
  )
}

export const remove = async (id) => {
  await options.store.remove(options.table, { id })
}

// guest or onboard session to authenticated
// export const rotate = async (sub, meta) => {
//   await remove()
//   return create()
// }
const nowInSeconds = () => Math.floor(Date.now() / 1000)
