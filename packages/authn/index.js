import { setTimeout } from 'node:timers/promises'
import { setOptions, nowInSeconds } from '@1auth/common'
import { randomId, makeSymetricKey } from '@1auth/crypto'

export const options = {
  store: undefined,
  notify: undefined,
  table: 'credentials',
  authenticationDuration: 500, // min duration authentication should take (ms)
  usernameExists: [] // hooks to allow what to be used as a username
}
export default (params) =>
  setOptions(
    options,
    ['store', 'notify', 'table', 'authenticationDuration', 'usernameExists'],
    params
  )

export const create = async (
  credentialType,
  { id, sub, value, ...rest },
  parentOptions
) => {
  const now = nowInSeconds()
  id ??= await randomId.create()
  const type = parentOptions.id + '-' + parentOptions[credentialType].type
  const otp = parentOptions[credentialType].otp
  const expire = parentOptions[credentialType].expire
    ? now + parentOptions[credentialType].expire
    : null
  const { encryptedKey } = makeSymetricKey(sub)

  const encryptedData = await parentOptions[credentialType].encode(
    value,
    encryptedKey,
    sub
  )
  return parentOptions.store.insert(options.table, {
    expire,
    ...rest,
    id,
    sub,
    type,
    otp,
    encryptionKey: encryptedKey,
    value: encryptedData,
    create: now,
    update: now
  })
}

export const update = async (
  credentialType,
  { id, sub, encryptionKey, value, ...rest },
  parentOptions
) => {
  const now = nowInSeconds()
  const encryptedData = await parentOptions[credentialType].encode(
    value,
    encryptionKey,
    sub
  )
  return parentOptions.store.update(
    options.table,
    { id },
    {
      ...rest,
      value: encryptedData,
      update: now
    }
  )
}

export const subject = async (username) => {
  return Promise.all(
    options.usernameExists.map((exists) => exists(username))
  ).then((identities) => {
    return identities.filter((lookup) => lookup)?.[0]
  })
}

export const authenticate = async (username, secret, parentOptions) => {
  const timeout = setTimeout(() => {}, options.authenticationDuration)
  const type = parentOptions.id + '-' + parentOptions.secret.type

  const sub = await subject(username)

  const credentials = await parentOptions.store.selectList(options.table, {
    sub,
    type
  }) // TODO and verify is not null
  let valid, id, encryptionKey
  for (const credential of credentials) {
    let { value, encryptionKey: encryptedKey, ...rest } = credential
    value = await parentOptions.secret.decode(value, encryptedKey, sub)
    valid = await parentOptions.secret.verify(secret, value, rest)
    if (valid) {
      id ??= credential.id
      encryptionKey ??= encryptedKey
      break
    }
  }

  if (valid && parentOptions.secret.otp) {
    await parentOptions.store.remove(options.table, { id })
  }
  await timeout
  if (!valid) throw new Error('401 Unauthorized')
  return { sub, id, encryptionKey, ...valid }
}

export const verifySecret = async (sub, id, parentOptions) => {
  const type = parentOptions.id + '-' + parentOptions.secret.type
  await parentOptions.store.update(
    options.table,
    { sub, id, type },
    { verify: nowInSeconds() }
  )
}

export const verify = async (credentialType, sub, token, parentOptions) => {
  const timeout = setTimeout(() => {}, options.authenticationDuration)
  const type = parentOptions.id + '-' + parentOptions[credentialType].type
  let id
  const credentials = await parentOptions.store.selectList(options.table, {
    sub,
    type
  })
  // TODO re-confirm when needed
  // .then((rows) => {
  //   if (rows.length) {
  //     return rows
  //   }
  //
  //   return parentOptions.store.select(options.table, { id: sub, type })
  // })

  let valid
  for (const credential of credentials) {
    let { value, encryptionKey, ...rest } = credential
    value = await parentOptions[credentialType].decode(
      value,
      encryptionKey,
      sub
    )
    valid = await parentOptions[credentialType].verify(token, value, rest)
    if (valid) {
      id = credential.id
      break
    }
  }
  if (valid && parentOptions[credentialType].otp) {
    await parentOptions.store.remove(options.table, { id })
  }
  if (!valid) throw new Error('401 Unauthorized')
  await timeout
  return { sub, id, ...valid }
}

export const expire = async (sub, id, parentOptions = options) => {
  await parentOptions.store.remove(options.table, { id, sub })
}

// TODO manage onboard state

// TODO save notification settings

// TODO authorize management?
