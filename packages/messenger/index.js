import {
  entropyToCharacterLength,
  charactersNumeric,
  randomNumeric,
  createSecretHash,
  verifySecretHash,
  randomId,
  createEncryptedDigest,
  symmetricGenerateEncryptionKey,
  symmetricEncryptFields,
  symmetricDecryptFields
} from '@1auth/crypto'

import {
  getOptions as authnGetOptions,
  create as authnCreate,
  verify as authnVerify
} from '@1auth/authn'

const id = 'messenger'

const token = {
  id,
  type: 'token',
  minLength: entropyToCharacterLength(19, charactersNumeric.length),
  otp: true,
  expire: 10 * 60,
  create: async () => randomNumeric(token.minLength),
  encode: async (value) => createSecretHash(value),
  decode: async (value) => value,
  verify: async (value, hash) => verifySecretHash(hash, value)
}

const defaults = {
  id,
  store: undefined,
  notify: undefined,
  table: 'messengers',
  idGenerate: true,
  idPrefix: 'messenger',
  randomId: { ...randomId },
  token,
  encryptedFields: ['value']
}

const options = {}
export default (opt = {}) => {
  Object.assign(options, defaults, opt)
}
export const getOptions = () => options

export const exists = async (type, value) => {
  const valueDigest = createEncryptedDigest(value)
  return options.store.exists(options.table, {
    type,
    digest: valueDigest
  })
}

export const lookup = async (type, value) => {
  const valueDigest = createEncryptedDigest(value)
  const res = await options.store.select(options.table, {
    type,
    digest: valueDigest
  })
  if (!res?.verify) return
  const { encryptionKey: encryptedKey, sub } = res
  delete res.encryptionKey
  const decryptedValues = symmetricDecryptFields(
    res,
    { encryptedKey, sub },
    options.encryptedFields
  )
  return decryptedValues
}

export const list = async (type, sub) => {
  const messengers = await options.store.selectList(options.table, {
    sub,
    type
  })
  for (let i = messengers.length; i--;) {
    const { encryptionKey: encryptedKey, sub } = messengers[i]
    delete messengers[i].encryptionKey
    messengers[i] = symmetricDecryptFields(
      messengers[i],
      { encryptedKey, sub },
      options.encryptedFields
    )
  }
  return messengers
}

export const create = async (type, sub, value, values) => {
  const digest = createEncryptedDigest(value)
  const valueExists = await options.store.select(
    options.table,
    {
      digest
    },
    ['id', 'sub', 'verify']
  )
  if (valueExists?.sub !== sub && valueExists?.verify) {
    await options.notify.trigger(
      `messenger-${type}-exists`,
      sub,
      {},
      { messengers: [{ id: valueExists.id }] }
    )
    return
  } else if (valueExists?.sub === sub) {
    await createToken(type, sub, valueExists.id)
    return valueExists.id
  }
  const now = nowInSeconds()

  const { encryptedKey, encryptionKey } = symmetricGenerateEncryptionKey(sub)
  const encryptedValues = symmetricEncryptFields(
    {
      ...values,
      value,
      digest
    },
    {
      encryptionKey,
      sub
    },
    options.encryptedFields
  )
  const params = {
    ...encryptedValues,
    sub,
    type,
    encryptionKey: encryptedKey,
    create: now,
    update: now // in case new digests need to be created
  }
  if (options.idGenerate) {
    params.id = options.randomId.create(options.idPrefix)
  }
  const id = await options.store.insert(options.table, params)

  await createToken(type, sub, id)
  return id
}

export const createToken = async (type, sub, sourceId) => {
  // await authnRemove(options.token, sub, sourceId);
  await authnGetOptions().store.remove(authnGetOptions().table, {
    sub,
    sourceId
  })
  const token = await options.token.create()
  // make authn id the same as messenger id
  const { id, expire } = await authnCreate(options.token, sub, {
    value: token,
    sourceId
  })
  await options.notify.trigger(
    `messenger-${type}-verify`,
    sub,
    {
      token,
      expire
    },
    { messengers: [{ id: sourceId }] }
  )
  return id
}

export const verifyToken = async (type, sub, token) => {
  let messengers = list(type, sub).then((items) => {
    const messengers = []
    for (let i = items.length; i--;) {
      const messenger = items[i]
      if (!messenger.verify) {
        continue
      }
      messengers.push({ id: messenger.id })
    }
    return messengers
  })
  const { sourceId } = await authnVerify(options.token, sub, token)
  await options.store.update(
    options.table,
    { sub, id: sourceId },
    { verify: nowInSeconds() }
  )
  messengers = await messengers
  if (messengers.length) {
    await options.notify.trigger(`messenger-${type}-create`, sub, undefined, {
      messengers
    })
  }
}

export const remove = async (type, sub, id) => {
  const messenger = await options.store.select(
    options.table,
    { id, sub, type },
    ['value', 'verify']
  )

  if (!messenger) {
    throw new Error('403 Unauthorized')
  }
  // await authnRemove(options.token, sub, id);
  await authnGetOptions().store.remove(authnGetOptions().table, {
    sub,
    sourceId: id
  })
  await options.store.remove(options.table, { id, sub })

  // remove request is self clean up
  if (!messenger?.verify) {
    return
  }

  const { encryptionKey: encryptedKey } = messenger
  delete messenger.encryptionKey
  const { value } = symmetricDecryptFields(
    messenger,
    { encryptedKey, sub },
    options.encryptedFields
  )

  await Promise.all([
    // Let messenger know it was removed
    options.notify.trigger(`messenger-${type}-remove-self`, sub, undefined, {
      messengers: [{ type, value }]
    }),

    // Let all others know one was removed
    options.notify.trigger(`messenger-${type}-remove`, sub)
  ])
}

export const select = async (type, sub, id) => {
  const res = await options.store.select(options.table, {
    type,
    sub,
    id
  })
  if (!res?.verify) return
  const { encryptionKey: encryptedKey } = res
  delete res.encryptionKey
  const decryptedValues = symmetricDecryptFields(
    res,
    { encryptedKey, sub },
    options.encryptedFields
  )
  return decryptedValues
}

const nowInSeconds = () => Math.floor(Date.now() / 1000)
