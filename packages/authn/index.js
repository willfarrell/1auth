import { setTimeout } from 'node:timers/promises'
import {
  randomId,
  makeSymetricKey,
  symmetricEncryptFields,
  symmetricDecryptFields
} from '@1auth/crypto'

const id = 'authn'

const defaults = {
  id,
  store: undefined,
  notify: undefined,
  table: 'authentications',
  idGenerate: true,
  idPrefix: 'authn',
  randomId: { ...randomId },
  authenticationDuration: 500, // minimum duration authentication should take (ms)
  usernameExists: [], // hooks to allow what to be used as a username
  encryptedFields: ['value']
}
const options = {}
export default (opt = {}) => {
  Object.assign(options, defaults, opt)
}
export const getOptions = () => options

export const exists = async (credentialOptions, sub, params) => {
  const type = makeType(credentialOptions)
  const list = await options.store.selectList(options.table, {
    ...params,
    sub,
    type
  })
  return list.length > 1
}

export const count = async (credentialOptions, sub) => {
  const type = makeType(credentialOptions)
  const credentials = await options.store.selectList(
    options.table,
    { sub, type },
    ['verify', 'expire']
  )
  let count = 0
  const now = nowInSeconds()
  for (let i = credentials.length; i--;) {
    const credential = credentials[i]
    if (credential.expire && credential.expire < now) {
      continue
    }
    if (!credential.verify) {
      continue
    }
    count += 1
  }
  return count
}

export const list = async (credentialOptions, sub, params, fields) => {
  const type = makeType(credentialOptions)
  const credentials = await options.store.selectList(
    options.table,
    {
      ...params,
      sub,
      type
    },
    fields
  )
  // const now = nowInSeconds();
  const list = []
  for (let i = credentials.length; i--;) {
    const credential = credentials[i]
    // TODO need filter for expire
    // if (credential.expire < now) {
    //   continue;
    // }
    const { encryptionKey: encryptedKey } = credential
    delete credential.encryptionKey
    const decryptedCredential = symmetricDecryptFields(
      credential,
      { encryptedKey, sub },
      options.encryptedFields
    )
    list.push(decryptedCredential)
  }
  return list
}

export const create = async (
  credentialOptions,
  sub,
  { id, value, ...values }
) => {
  const now = nowInSeconds()
  const type = makeType(credentialOptions)
  let { otp, expire } = credentialOptions
  expire &&= now + expire

  if (options.idGenerate) {
    id ??= await options.randomId.create(options.idPrefix)
  }
  value ??= credentialOptions.create()
  const encodedValue = await credentialOptions.encode(value)

  const { encryptionKey, encryptedKey } = makeSymetricKey(sub)
  const encryptedValues = symmetricEncryptFields(
    { ...values, value: encodedValue },
    { encryptionKey, sub },
    options.encryptedFields
  )
  const params = {
    ...encryptedValues,
    sub,
    type,
    otp,
    encryptionKey: encryptedKey,
    create: now,
    update: now,
    expire
  }
  if (options.idGenerate) {
    params.id = id
  }
  const row = await options.store.insert(options.table, params)
  return { type, id: row.id, value, otp, expire }
}

export const update = async (
  credentialOptions,
  { id, sub, encryptionKey, encryptedKey, value, ...values }
) => {
  const now = nowInSeconds()
  // const type = makeType(credentialOptions);

  const encryptedData = await credentialOptions.encode(
    value,
    encryptionKey,
    encryptedKey,
    sub
  )
  return options.store.update(
    options.table,
    { sub, id },
    {
      ...values,
      value: encryptedData,
      update: now
    }
  )
}

export const subject = async (username) => {
  return Promise.all(
    options.usernameExists.map((exists) => {
      return exists(username)
    })
  ).then((identities) => {
    return identities.filter((lookup) => lookup)?.[0]
  })
}

export const authenticate = async (credentialOptions, username, secret) => {
  const sub = await subject(username)

  const timeout = setTimeout(options.authenticationDuration)
  const type = makeType(credentialOptions)

  const credentials = await options.store.selectList(
    options.table,
    {
      sub,
      type
    },
    ['id', 'encryptionKey', 'value', 'otp', 'verify', 'expire', 'sourceId']
  )
  let valid
  for (const credential of credentials) {
    // non-opt credentials must be verified before use
    if (!credential.otp && !credential.verify) {
      continue
    }
    const { encryptionKey: encryptedKey } = credential
    const decryptedCredential = symmetricDecryptFields(
      credential,
      { encryptedKey, sub },
      options.encryptedFields
    )
    let { value, ...values } = decryptedCredential
    value = await credentialOptions.decode(value)
    valid = await credentialOptions.verify(secret, value, values)
    if (valid) {
      const { id, otp } = credential
      if (otp) {
        await options.store.remove(options.table, { id, sub })
      } else if (credentialOptions.clean) {
        await credentialOptions.clean(sub, value, values)
      } else {
        const now = nowInSeconds()
        await options.store.update(
          options.table,
          { id, sub },
          { update: now, lastused: now }
        )
      }

      break
    }
  }

  await timeout
  if (!valid) throw new Error('401 Unauthorized')
  return sub
}

export const verifySecret = async (credentialOptions, sub, id) => {
  // const type = makeType(credentialOptions);
  const now = nowInSeconds()
  await options.store.update(
    options.table,
    { sub, id },
    { update: now, verify: now }
  )
}

export const verify = async (credentialOptions, sub, input) => {
  const timeout = setTimeout(options.authenticationDuration)
  const type = makeType(credentialOptions)

  const credentials = await options.store.selectList(options.table, {
    sub,
    type
  })

  let valid, credential
  for (credential of credentials) {
    const { encryptionKey: encryptedKey } = credential
    const decryptedCredential = symmetricDecryptFields(
      credential,
      { encryptedKey, sub },
      options.encryptedFields
    )
    let { value, ...values } = decryptedCredential
    value = await credentialOptions.decode(value)
    valid = await credentialOptions.verify(input, value, values)
    if (valid) {
      const { id, otp } = credential
      if (otp) {
        await options.store.remove(options.table, { id, sub })
      }

      break
    }
  }

  await timeout
  if (!valid) throw new Error('401 Unauthorized')
  return { ...credential, ...valid }
}

export const expire = async (credentialOptions, sub, id) => {
  // const type = makeType(credentialOptions);
  await options.store.update(
    options.table,
    { sub, id },
    { expire: nowInSeconds() - 1 }
  )
}

export const remove = async (credentialOptions, sub, id) => {
  const type = makeType(credentialOptions)
  await options.store.remove(options.table, { id, type, sub })
}

// TODO manage onboard state

// TODO save notification settings

// TODO authorize management?

const makeType = (credentialOptions) =>
  credentialOptions.id + '-' + credentialOptions.type
const nowInSeconds = () => Math.floor(Date.now() / 1000)
