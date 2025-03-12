import { setTimeout } from 'node:timers/promises'
import {
  randomId,
  symmetricGenerateEncryptionKey,
  symmetricEncryptFields,
  symmetricDecryptFields
} from '@1auth/crypto'

const id = 'authn'

const defaults = {
  id,
  log: false,
  store: undefined,
  notify: undefined,
  table: 'authentications',
  idGenerate: true,
  idPrefix: 'authn',
  randomId: { ...randomId },
  authenticationDuration: 100, // minimum duration authentication should take (ms)
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
  const items = await options.store.selectList(
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
  for (let i = items.length; i--;) {
    const item = items[i]
    // TODO need filter for expire
    // if (credential.expire < now) {
    //   continue;
    // }
    const { encryptionKey: encryptedKey } = item
    delete item.encryptionKey
    const decryptedItem = symmetricDecryptFields(
      item,
      { encryptedKey, sub },
      options.encryptedFields
    )
    list.push(decryptedItem)
  }
  return list
}

const createCredential = async (
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

  const { encryptionKey, encryptedKey } = symmetricGenerateEncryptionKey(sub)
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
  return params
}

export const create = async (credentialOptions, sub, values) => {
  const params = await createCredential(credentialOptions, sub, values)
  const row = await options.store.insert(options.table, params)
  return { ...params, id: row.id }
}

export const createList = async (credentialOptions, sub, list) => {
  const rows = await Promise.all(
    list.map((values) => createCredential(credentialOptions, sub, values))
  )
  const params = rows[0]
  const res = await options.store.insertList(options.table, rows)
  return { ...params, id: res }
}

export const update = async (
  credentialOptions,
  { id, sub, encryptionKey, encryptedKey, value, ...values }
) => {
  const now = nowInSeconds()
  // const type = makeType(credentialOptions);

  const encodedValue = await credentialOptions.encode(value)

  const encryptedValues = symmetricEncryptFields(
    { ...values, value: encodedValue },
    { encryptionKey, encryptedKey, sub },
    options.encryptedFields
  )

  return options.store.update(
    options.table,
    { sub, id },
    {
      ...encryptedValues,
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
  const now = nowInSeconds()
  let valid
  let skipIgnoredCount = 0
  let skipExpiredCount = 0
  for (const credential of credentials) {
    // non-opt credentials must be verified before use
    if (!credential.otp && !credential.verify) {
      skipIgnoredCount += 1
      continue
    }
    // skip expired
    if (credential.expire < now) {
      skipExpiredCount += 1
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
    try {
      valid = await credentialOptions.verify(secret, value, values)
    } catch (e) {
      if (options.log) {
        options.log(e)
      }
      continue
    }
    if (valid) {
      const { id, otp } = credential
      if (otp) {
        await expire(credentialOptions, sub, id, { lastused: now })
      } else {
        const now = nowInSeconds()
        await options.store.update(
          options.table,
          { id, sub },
          { lastused: now }
        )
      }

      if (credentialOptions.cleanup) {
        await credentialOptions.cleanup(sub, value, values)
      }
      break
    }
  }

  await timeout
  if (!valid) {
    let cause = 'invalid'
    const credentialsCount = credentials.length - skipIgnoredCount
    if (credentialsCount === 0) {
      cause = 'missing'
    } else if (skipExpiredCount === credentialsCount) {
      cause = 'expired'
    }
    throw new Error('401 Unauthorized', { cause })
  }
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

// TODO add in sourceId as filter for messengers
export const verify = async (credentialOptions, sub, input) => {
  const timeout = setTimeout(options.authenticationDuration)
  const type = makeType(credentialOptions)

  const credentials = await options.store.selectList(options.table, {
    sub,
    type
  })

  const now = nowInSeconds()
  let valid
  let credential
  let skipExpiredCount = 0
  for (credential of credentials) {
    // skip expired
    if (credential.expire < now) {
      skipExpiredCount += 1
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
    try {
      valid = await credentialOptions.verify(input, value, values)
    } catch (e) {
      if (options.log) {
        options.log(e)
      }
      continue
    }
    if (valid) {
      const { id, otp } = credential
      if (otp) {
        await remove(credentialOptions, sub, id)
      }
      break
    }
  }

  await timeout

  if (!valid) {
    let cause = 'invalid'
    const credentialsCount = credentials.length
    if (credentialsCount === 0) {
      cause = 'missing'
    } else if (skipExpiredCount === credentialsCount) {
      cause = 'expired'
    }
    throw new Error('401 Unauthorized', { cause })
  }
  return { ...credential, ...valid }
}

export const expire = async (credentialOptions, sub, id, values) => {
  // const type = makeType(credentialOptions);
  await options.store.update(
    options.table,
    { sub, id },
    { ...values, expire: nowInSeconds() - 1 }
  )
}

export const remove = async (credentialOptions, sub, id) => {
  const type = makeType(credentialOptions)
  await options.store.remove(options.table, { id, type, sub })
}

export const select = async (credentialOptions, sub, id) => {
  const type = makeType(credentialOptions)
  const item = await options.store.select(options.table, { id, type, sub })
  const { encryptionKey: encryptedKey } = item
  delete item.encryptionKey
  const decryptedItem = symmetricDecryptFields(
    item,
    { encryptedKey, sub },
    options.encryptedFields
  )
  return decryptedItem
}

// TODO manage onboard state

// TODO save notification settings

// TODO authorize management?

const makeType = (credentialOptions) =>
  credentialOptions.id + '-' + credentialOptions.type
const nowInSeconds = () => Math.floor(Date.now() / 1000)
