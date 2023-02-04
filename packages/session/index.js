import { setOptions, nowInSeconds } from '@1auth/common'
import { session, makeSymetricKey, encrypt } from '@1auth/crypto'

const options = {
  store: undefined,
  notify: undefined,
  table: 'sessions',
  cache: true,
  expire: session.expire
}
const cache = {}

export default (params) => {
  options.id = session
  setOptions(options, ['store', 'notify', 'table', 'cache', 'expire'], params)
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

// to promote when on boarding
export const update = async (sub, id) => {
  await options.store.update(options.table, { id }, { sub })
}

export const remove = async (id) => {
  await options.store.remove(options.table, { id })
}

export const lookup = async (id, meta) => {
  const now = nowInSeconds()
  let session
  if (id) {
    session = cache[id]
    session ??= await options.store.select(options.table, { id })
    if (session?.expire < now) {
      return remove(session.sub, id)
    }
  }
  // session ??= await options.id.create(null, meta)

  /* let authToken // TODO return JWT or IAM to be passed around
  if (session.sub) {
    const account = await options.store.select('accounts', {
      sub: session.sub
    })
    authToken = account
  } else {
    authToken = session
  }
  return authToken */
  return session
}

// guest or onboard session to authenticated
// export const rotate = async (sub, meta) => {
//   await remove()
//   return create()
// }
