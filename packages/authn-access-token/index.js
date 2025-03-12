import {
  charactersAlphaNumeric,
  entropyToCharacterLength,
  randomAlphaNumeric,
  createSecretHash,
  verifySecretHash,
  createDigest
} from '@1auth/crypto'
import {
  getOptions as authnGetOptions,
  count as authnCount,
  select as authnSelect,
  list as authnList,
  create as authnCreate,
  authenticate as authnAuthenticate,
  expire as authnExpire,
  remove as authnRemove
} from '@1auth/authn'

const id = 'accessToken'

const secret = {
  id,
  type: 'secret',
  minLength: entropyToCharacterLength(112, charactersAlphaNumeric.length),
  otp: false,
  expire: 30 * 24 * 60 * 60,
  create: async () => randomAlphaNumeric(secret.minLength),
  encode: async (value) => createSecretHash(value),
  decode: async (value) => value,
  verify: async (value, hash) => verifySecretHash(hash, value)
}

const defaults = {
  id,
  prefix: 'pat', // Personal Access Token
  secret
}
const options = {}
export default (opt = {}) => {
  Object.assign(options, authnGetOptions(), defaults, opt)
}

// authenticate(accessToken, accessToken)
export const authenticate = async (username, secret) => {
  username ??= secret
  return await authnAuthenticate(options.secret, username, secret)
}

export const exists = async (secret) => {
  const digest = createDigest(secret)
  return options.store.exists(options.table, { digest })
}

export const lookup = async (secret) => {
  const digest = createDigest(secret)
  return await options.store.select(options.table, { digest })
}

export const count = async (sub) => {
  return await authnCount(options.secret, sub)
}

export const select = async (sub, id) => {
  return await authnSelect(options.secret, sub, id)
}

export const list = async (sub) => {
  return await authnList(options.secret, sub)
}

// expire: expire duration (s)
export const create = async (sub, values = {}) => {
  const secretToken = await options.secret.create()
  const secret = options.prefix + '-' + secretToken
  const digest = createDigest(secret)
  const now = nowInSeconds()
  const { id, expire } = await authnCreate(options.secret, sub, {
    ...values,
    value: secret,
    digest,
    verify: now
  })
  await options.notify.trigger('authn-access-token-create', sub, {
    expire
  })

  return { id, secret }
}

export const expire = async (sub, id) => {
  await authnExpire(options.secret, sub, id)
  await options.notify.trigger('authn-access-token-expire', sub)
}

export const remove = async (sub, id) => {
  await authnRemove(options.secret, sub, id)
  await options.notify.trigger('authn-access-token-remove', sub)
}

const nowInSeconds = () => Math.floor(Date.now() / 1000)
