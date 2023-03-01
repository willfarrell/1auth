import {
  //   randomId,
  outOfBandToken
  //   createDigest,
  //   makeSymetricKey,
  //   encrypt
} from '@1auth/crypto'
import { options as messengerOptions } from '@1auth/messenger'
// import {
//   create as authnCreate,
//   verify as authnVerify,
//   expire as authnExpire
// } from '@1auth/authn'

const options = {
  id: 'webSocket'
}

export default (params) => {
  Object.assign(options, messengerOptions, { token: outOfBandToken }, params)
}
/*
export const exists = async (emailAddress) => {
  return options.store.exists(options.table, {
    digest: await __digest(__sanitize(emailAddress))
  })
}

export const lookup = async (emailAddress) => {
  const res = options.store.select(options.table, {
    digest: __digest(__sanitize(emailAddress))
  }) // TODO verify > 0
  if (!res.verify) return
  return res
}

export const create = async (sub, emailAddress) => {
  const emailAddressSanitized = __sanitize(emailAddress)
  const emailAddressDigest = await __digest(emailAddressSanitized)
  if (!__validate(emailAddressSanitized)) {
    throw new Error('400 invalid emailAddress')
  }
  const emailAddressExists = await options.store.select(options.table, {
    digest: emailAddressDigest
  })
  if (emailAddressExists?.sub === sub && emailAddressExists?.verify) {
    await options.notify.trigger('messenger-emailAddress-exists', sub)
    return
  } else if (emailAddressExists?.verify) {
    await createToken(sub, emailAddressExists.id)
    return emailAddressExists.id
  }
  const now = nowInSeconds()
  const id = await randomId.create()
  const { encryptedKey } = makeSymetricKey(sub)
  const encryptedData = encrypt(emailAddress, encryptedKey, sub)
  await options.store.insert(options.table, {
    id,
    sub,
    type: options.id,
    encryptionKey: encryptedKey,
    value: encryptedData,
    digest: emailAddressDigest,
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
    await options.notify.trigger('messenger-emailAddress-removed', sub)
  }
}

export const createToken = async (sub, id) => {
  await authnExpire(sub, id, options)
  const token = await options.token.create()
  id = await authnCreate(options.token.type, { id, sub, value: token }, options)
  await options.notify.trigger('messenger-emailAddress-verify', sub, { token })
  return id
}

export const verifyToken = async (sub, token) => {
  const { id } = await authnVerify(options.token.type, sub, token, options)
  await authnExpire(sub, id, options)
  await options.store.update(options.table, { id, sub }, { verify: nowInSeconds() })
  await options.notify.trigger('messenger-emailAddress-create', sub) // make sure message not sent when part of onboard
}

*/

// const nowInSeconds = () => Math.floor(Date.now() / 1000)
