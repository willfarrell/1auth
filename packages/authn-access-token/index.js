import { accessToken, createDigest } from '@1auth/crypto'
import {
  options as authnOptions,
  create as authnCreate,
  authenticate as authnVerifyAuthentication,
  expire as authnExpire
} from '@1auth/authn'

const options = {
  id: 'accessToken',
  prefix: 'pat' // Personal Access Token
}
export default (params) => {
  Object.assign(options, authnOptions, { secret: accessToken }, params)
}

export const exists = async (secret) => {
  const digest = await createDigest(secret)
  return options.store.exists(options.table, { digest })
}

// authenticate(accessToken, accessToken)
export const authenticate = async (username, secret) => {
  const { sub } = await authnVerifyAuthentication(username, secret, options)
  return sub
}

export const create = async (sub, name, expire = options.secret.expire) => {
  const secret = options.prefix + '-' + (await options.secret.create())
  const now = nowInSeconds()
  const digest = await createDigest(secret)
  await authnCreate(
    options.secret.type,
    { sub, name, value: secret, digest, verify: now, expire: now + expire },
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

const nowInSeconds = () => Math.floor(Date.now() / 1000)
