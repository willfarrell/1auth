import { accessToken, createDigest } from '@1auth/crypto'
import {
  options as authnOptions,
  create as authnCreate,
  authenticate as authnVerifyAuthentication,
  expire as authnExpire
} from '@1auth/authn'

const options = {
  id: 'access-token',
  prefix: 'pat' // Personal Access Token
}
export default (params) => {
  Object.assign(options, authnOptions, { secret: accessToken }, params)
}

export const exists = async (secret) => {
  return options.store.exists(options.table, {
    id: await __id(secret)
  })
}

export const authenticate = async (username, secret) => {
  const { sub } = await authnVerifyAuthentication(username, secret, options)
  return sub
}

export const create = async (sub, name, expire = options.secret.expire) => {
  const secret = options.prefix + '-' + (await options.secret.create())
  const id = await __id(secret)
  const now = nowInSeconds()
  await authnCreate(
    options.secret.type,
    { id, sub, name, value: secret, verify: now, expire: now + expire },
    options
  )
  await options.notify.trigger('account-access-token-create', sub)
  return secret
}

export const list = async (sub, type = options.id + '-secret') => {
  return options.store.selectList(options.table, {
    sub,
    type
  })
}

export const remove = async (sub, id) => {
  await authnExpire(sub, id, options)
  await options.notify.trigger('account-access-token-remove', sub)
}

const __id = async (secret) => {
  return createDigest(secret).then((digest) => digest.split(':')[1])
}

const nowInSeconds = () => Math.floor(Date.now() / 1000)
