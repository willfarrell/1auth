import { setOptions, nowInSeconds } from '@1auth/common'
import { options as accountOptions } from '@1auth/account'

export const regexp = /^[a-z0-9-]*$/
export const jsonSchema = {
  type: 'string',
  pattern: '^[a-z0-9-]*$',
  minLength: 1,
  maxLength: 32
}

const options = {
  id: 'username',
  blacklist: ['admin', 'security']
}
export default (params) => {
  options.store = accountOptions.store
  options.notify = accountOptions.notify
  options.table = accountOptions.table
  setOptions(options, ['id', 'blacklist'], params)
}

export const exists = async (username) => {
  return options.store.exists(options.table, {
    username: __sanitize(username)
  })
}

export const lookup = async (username) => {
  if (!username) return {}
  return (
    (await options.store.select(options.table, {
      username: __sanitize(username)
    })) ?? {}
  )
}

export const create = async (sub, username) => {
  if (!__validate(username)) {
    throw new Error('400 invalid characters')
  }
  if (!__blacklist(username) || (await exists(username))) {
    throw new Error('409 Conflict')
  }
  await options.store.update(
    options.table,
    { sub },
    { username: __sanitize(username), update: nowInSeconds() }
  )
}

export const update = async (sub, username) => {
  await create(sub, username)
  await options.notify('account-username-change')
}

export const recover = async (sub) => {
  const { username } = await options.store.select(options.table, { sub })
  await options.notify('account-username-recover', { username })
}

export const __sanitize = (value) => {
  return value
    .trim()
    .toLowerCase()
    .replace(/^[^a-z0-9-]+$/, '')
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
