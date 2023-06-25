import { setTimeout } from 'node:timers/promises'
import { randomId, makeSymetricKey } from '@1auth/crypto'

export const options = {
  store: undefined,
  notify: undefined,
  table: 'credentials',
  authenticationDuration: 500, // min duration authentication should take (ms)
  usernameExists: [] // hooks to allow what to be used as a username
}
export default (params) => {
  Object.assign(options, params)
}
export const getOptions = () => options

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
  await options.store.insert(options.table, {
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
  return id
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
  return options.store.update(
    options.table,
    { id, sub },
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

  const credentials = await options.store.selectList(options.table, {
    sub,
    type
  })
  let valid, id, encryptionKey
  for (const credential of credentials) {
    if (!credential.verify) continue
    let { value, encryptionKey: encryptedKey, ...rest } = credential
    value = await parentOptions.secret.decode(value, encryptedKey, sub)
    valid = await parentOptions.secret.verify(secret, value, rest)
    if (valid) {
      id ??= credential.id
      encryptionKey ??= encryptedKey
      break
    }
  }

  if (parentOptions.secret.otp) {
    // delete OTP to prevent re-use
    await options.store.remove(options.table, { id, sub })
  } else if (valid && parentOptions.id !== 'WebAuthn') {
    // WebAuthn has to update, skip here
    const now = nowInSeconds()
    await options.store.update(
      options.table,
      { id, sub },
      { update: now, lastused: now }
    )
  }

  await timeout
  if (!valid) throw new Error('401 Unauthorized')
  return { sub, id, encryptionKey, ...valid }
}

export const verifySecret = async (sub, id, parentOptions) => {
  // const type = parentOptions.id + '-' + parentOptions.secret.type
  const now = nowInSeconds()
  await options.store.update(
    options.table,
    { id, sub },
    { update: now, verify: now }
  )
}

export const verify = async (credentialType, sub, token, parentOptions) => {
  const timeout = setTimeout(() => {}, options.authenticationDuration)
  const type = parentOptions.id + '-' + parentOptions[credentialType].type
  let id
  const credentials = await options.store.selectList(options.table, {
    sub,
    type
  })
  // TODO re-confirm when needed
  // .then((rows) => {
  //   if (rows.length) {
  //     return rows
  //   }
  //
  //   return options.store.select(options.table, { id: sub, type })
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
    await options.store.remove(options.table, { id, sub })
  }
  if (!valid) throw new Error('401 Unauthorized')
  await timeout
  return { sub, id, ...valid }
}

export const expire = async (sub, id, parentOptions = options) => {
  await options.store.remove(options.table, { id, sub })
}

// TODO manage onboard state

// TODO save notification settings

// TODO authorize management?

const nowInSeconds = () => Math.floor(Date.now() / 1000)
