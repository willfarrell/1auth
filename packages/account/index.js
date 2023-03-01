import {
  subject,
  makeSymetricKey,
  makeAsymmetricKeys,
  encrypt,
  decrypt
} from '@1auth/crypto'

export const options = {
  store: undefined,
  notify: undefined,
  table: 'accounts',
  encryptedKeys: []
}
export default (params) => {
  Object.assign(options, { id: subject }, params)
}
export const exists = async (sub) => {
  return options.store.exists(options.table, { sub })
}

export const lookup = async (sub) => {
  const item = options.store.select(options.table, { sub })
  for (const key of options.encryptedKeys) {
    item[key] = await decrypt(item[key], item.encryptionKey, sub)
  }
  delete item.encryptionKey
  delete item.privateKey
  return item
}

export const create = async (values = {}) => {
  const sub = await options.id.create()

  // const notifications = {}
  // const authorization = {}
  const now = nowInSeconds()
  const { encryptionKey, encryptedKey } = makeSymetricKey(sub)
  const { publicKey, privateKey } = await makeAsymmetricKeys(encryptionKey)

  for (const key of options.encryptedKeys) {
    values[key] &&= await encrypt(values[key], encryptionKey, sub)
  }

  await options.store.insert(options.table, {
    ...values,
    sub,
    encryptionKey: encryptedKey,
    publicKey,
    privateKey,
    create: now,
    update: now
    // notifications,
    // authorization
  })

  // TODO update session, attach sub
  return sub
}

// for in the clear user metadata
export const update = async (sub, values = {}) => {
  const { encryptionKey } = await options.store.select(options.table, { sub })

  for (const key of options.encryptedKeys) {
    values[key] &&= await encrypt(values[key], encryptionKey, sub)
  }
  await options.store.update(
    options.table,
    { sub },
    { ...values, update: nowInSeconds() }
  )
}

export const remove = async (sub) => {
  await options.store.remove(options.table, { sub }) // Should trigger removal of credentials and messengers
  await options.notify.trigger('account-remove', sub)
}

/* export const expire = async (sub) => {
  const expire = nowInSeconds() + 90 * 24 * 60 * 60
  await options.store.update(options.table, { sub }, { expire })
  await options.notify.trigger('account-expire', sub)
  // TODO clear sessions
}

export const recover = async (sub) => {
  await options.store.update(options.table, { sub }, { expire: null })
  await options.notify.trigger('account-recover', sub)
} */

// TODO manage onboard state

// TODO save notification settings

// TODO authorize management?

const nowInSeconds = () => Math.floor(Date.now() / 1000)
