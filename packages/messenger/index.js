import {
  randomId,
  outOfBandToken,
  createDigest,
  makeSymetricKey,
  encrypt
  // decrypt
} from '@1auth/crypto'

import {
  create as authnCreate,
  verify as authnVerify,
  expire as authnExpire
} from '@1auth/authn'

export const options = {
  table: 'messengers',
  store: undefined,
  notify: undefined
}
export default (params) => {
  Object.assign(options, { token: outOfBandToken }, params)
}

export const exists = async (value) => {
  return options.store.exists(options.table, {
    digest: await createDigest(value)
  })
}

export const lookup = async (sub, type) => {
  return options.store.selectList(options.table, { sub, type }) // { sub, type }
}

// TODO everything below, update email to build on top of
export const create = async (sub, type, value) => {
  const valueDigest = await createDigest(value)
  const valueExists = await options.store.select(options.table, {
    digest: valueDigest
  })
  if (valueExists?.sub === sub && valueExists?.verify) {
    await options.notify.trigger(`messenger-${type}-exists`, sub)
    return
  } else if (valueExists?.verify) {
    await createToken(sub, valueExists.id)
    return valueExists.id
  }
  const now = nowInSeconds()
  const id = await randomId.create()
  const { encryptedKey } = makeSymetricKey(sub)
  const encryptedData = encrypt(value, encryptedKey, sub)
  await options.store.insert(options.table, {
    id,
    sub,
    type: options.id,
    encryptionKey: encryptedKey,
    value: encryptedData,
    digest: valueDigest,
    create: now,
    update: now // in case new digests need to be created
  })
  await createToken(sub, id)
  return id
}

export const remove = async (sub, id) => {
  const item = await options.store.select(options.table, { id })
  const verifyTimestamp = item?.verify

  if (item.sub !== sub) {
    throw new Error('403 Unauthorized')
  }
  await authnExpire(sub, id, options)
  await options.store.remove(options.table, { id, sub })

  if (verifyTimestamp) {
    await options.notify.trigger(`messenger-${item.type}-removed`, sub)
  }
}

export const createToken = async (sub, id) => {
  await authnExpire(sub, id, options)
  const token = await options.token.create()
  id = await authnCreate(
    options.token.type,
    { id, sub, value: token },
    options
  )
  await options.notify.trigger('messenger-TYPE-verify', sub, { token })
  return id
}

export const verifyToken = async (sub, token) => {
  const { id } = await authnVerify(options.token.type, sub, token, options)
  await authnExpire(sub, id, options)
  await options.store.update(
    options.table,
    { id, sub },
    { verify: nowInSeconds() }
  )
  await options.notify.trigger('messenger-TYPE-create', sub) // make sure message not sent when part of onboard
}

const nowInSeconds = () => Math.floor(Date.now() / 1000)
