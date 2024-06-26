import {
  entropyToCharacterLength,
  charactersAlphaNumeric,
  randomAlphaNumeric,
  randomId,
  makeSymetricKey,
  makeAsymmetricKeys,
  symetricEncryptFields,
  symetricDecryptFields
} from '@1auth/crypto'

const id = 'authn'
const randomSubject = {
  type: 'id',
  minLength: entropyToCharacterLength(64, charactersAlphaNumeric.length),
  create: async (prefix) =>
    (prefix ? prefix + '_' : '') + randomAlphaNumeric(randomSubject.minLength)
}

const defaults = {
  id,
  store: undefined,
  notify: undefined,
  table: 'accounts',
  idGenerate: true,
  idPrefix: 'user',
  subPrefix: 'sub',
  randomId,
  randomSubject,
  encryptedFields: ['privateKey'] // TODO has encryption build-in
}
const options = {}
export default (params) => {
  Object.assign(options, defaults, params)
}
export const getOptions = () => options

export const exists = async (sub) => {
  return options.store.exists(options.table, { sub })
}

export const lookup = async (sub) => {
  let item = await options.store.select(options.table, { sub })
  if (!item) return
  const { encryptionKey: encryptedKey } = item
  delete item.encryptionKey
  delete item.privateKey
  item = symetricDecryptFields(
    item,
    { encryptedKey, sub },
    options.encryptedFields
  )
  return item
}

export const create = async (values = {}) => {
  const sub = await options.randomSubject.create(options.subPrefix)
  const asymmetricKeys = await makeAsymmetricKeys()

  const { encryptionKey, encryptedKey } = makeSymetricKey(sub)
  const encryptedValues = symetricEncryptFields(
    { ...values, ...asymmetricKeys },
    { encryptionKey, sub },
    options.encryptedFields
  )

  const now = nowInSeconds()
  const params = {
    create: now, // allow use for migration import
    ...encryptedValues,
    sub,
    encryptionKey: encryptedKey,
    update: now
  }
  if (options.idGenerate) {
    params.id = await options.randomId.create(options.idPrefix)
  }
  await options.store.insert(options.table, params)

  // TODO update guest session, attach sub
  return sub
}

// for in the clear user metadata
export const update = async (sub, values = {}) => {
  const { encryptionKey: encryptedKey } = await options.store.select(
    options.table,
    {
      sub
    },
    ['encryptionKey']
  )

  values = symetricEncryptFields(
    values,
    { encryptedKey, sub },
    options.encryptedFields
  )

  await options.store.update(
    options.table,
    { sub },
    { ...values, update: nowInSeconds() }
  )
}

export const remove = async (sub) => {
  // Should trigger removal of credentials and messengers
  await options.store.remove(options.table, { sub })
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
