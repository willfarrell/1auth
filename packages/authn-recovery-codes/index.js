import { setOptions } from '@1auth/common'
import { recoveryCode } from '@1auth/crypto'
import {
  options as authnOptions,
  create as authnCreate,
  authenticate as authnVerifyAuthentication,
  verifySecret as authnVerifySecret
} from '@1auth/authn'

const options = {
  id: 'recovery',
  count: 5
}
export default (params) => {
  options.store = authnOptions.store
  options.notify = authnOptions.notify
  options.table = authnOptions.table
  options.secret = recoveryCode
  setOptions(options, ['id', 'count'], params)
}

export const authenticate = async (username, secret) => {
  const { sub } = await authnVerifyAuthentication(username, secret, options)
  return sub
}

export const create = async (sub) => {
  const secrets = await createSecrets(sub)
  return secrets
}

export const update = async (sub) => {
  const secrets = await createSecrets(sub)
  await options.notify('authn-recovery-codes-update', sub)
  return secrets
}

/* export const verifySecret = async (sub, ids) => {
  if (!Array.isArray(ids)) ids = [ids]
  for (const id of ids) {
    await authnVerifySecret(sub, id, options)
  }
} */

const createSecrets = async (sub) => {
  const existingSecrets = await options.store.selectList(options.table, {
    sub,
    type: options.id + '-' + options.secret.type
  })
  const secrets = []
  for (let i = options.count; i--; ) {
    const secret = await options.secret.create()
    const id = await authnCreate(
      options.secret.type,
      { sub, value: secret },
      options
    )
    secrets.push({ id, secret })
  }

  for (const item of existingSecrets) {
    options.store.remove(options.table, { id: item.id })
  }

  return secrets
}

export const list = async (sub) => {
  return options.store.selectList(options.table, { sub, type: options.id })
}
