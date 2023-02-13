import { setOptions, nowInSeconds } from '@1auth/common'
import { accessToken } from '@1auth/crypto'
import {
  options as authnOptions,
  create as authnCreate,
  authenticate as authnVerifyAuthentication,
  verifySecret as authnVerifySecret
} from '@1auth/authn'

const options = {
  id: 'access-token',
  prefix: 'pat' // Personal Access Token
}
export default (params) => {
  options.store = authnOptions.store
  options.notify = authnOptions.notify
  options.table = authnOptions.table
  options.secret = accessToken
  setOptions(options, ['id', 'prefix'], params)
}

export const authenticate = async (username, secret) => {
  const { sub } = await authnVerifyAuthentication(username, secret, options)
  return sub
}

export const create = async (sub, name, expire = options.secret.expire) => {
  const secret = options.prefix + '-' + (await options.secret.create())
  const id = await authnCreate(
    options.secret.type,
    { sub, name, value: secret, expire: nowInSeconds() + expire },
    options
  )
  await options.notify('account-access-token-create', sub)
  return secret
}

export const list = async (sub) => {
  return options.store.selectList(options.table, { sub, type: options.id })
}

export const remove = async (sub, id) => {
  await authnExpire(sub, id, options)
  await options.notify('account-access-token-remove', sub)
}
