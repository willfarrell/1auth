import {
  getOptions as accountOptions,
  update as accountUpdate
} from '@1auth/account'

import { createDigest } from '@1auth/crypto'

// Only allow characters that are safe to encode
// . not allowed because it can be used to declare and extension
export const regexp = /^[a-z0-9_-]*$/
export const jsonSchema = {
  type: 'string',
  pattern: '^[a-z0-9_-]*$',
  minLength: 1,
  maxLength: 32
}

const options = {
  id: 'username',
  blacklist: []
  // minLength: 1,
  // maxLength: 32
}
export default (params) => {
  Object.assign(options, accountOptions(), params)
}

export const exists = async (username) => {
  const usernameSanitized = __sanitize(username)
  return options.store.exists(options.table, {
    digest: await createDigest(usernameSanitized)
  })
}

export const lookup = async (username) => {
  if (!username) return {}
  const usernameSanitized = __sanitize(username)
  return await options.store.select(options.table, {
    digest: await createDigest(usernameSanitized)
  })
}

export const create = async (sub, username) => {
  const usernameSanitized = __sanitize(username)
  if (!__validate(usernameSanitized)) {
    throw new Error('400 invalid characters')
  }
  if (!__blacklist(usernameSanitized) || (await exists(usernameSanitized))) {
    throw new Error('409 Conflict')
  }
  await accountUpdate(sub, {
    username,
    digest: await createDigest(usernameSanitized)
  })
}

export const update = async (sub, username) => {
  await create(sub, username)
  await options.notify.trigger('account-username-change')
}

export const recover = async (sub) => {
  const { username } = await options.store.select(options.table, { sub })
  await options.notify.trigger('account-username-recover', { username })
}

export const __sanitize = (value) => {
  return value.trim().toLocaleLowerCase()
}

export const __validate = (value) => {
  if (!regexp.test(value)) {
    return false
  }
  return true
}

export const __blacklist = (value) => {
  if (options.blacklist.includes(value)) {
    return false
  }
  return true
}
