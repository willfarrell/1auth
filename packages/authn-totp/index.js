import { setOptions, nowInSeconds } from '@1auth/common'
import {
  oneTimeSecret,
  oneTimeToken,
  entropyToCharacterLength,
  decrypt
} from '@1auth/crypto'
import {
  options as authnOptions,
  create as authnCreate,
  verifySecret as authnVerifySecret,
  verify as authnVerify,
  expire as authnExpire
} from '@1auth/authn'

import { TOTPAsync } from '@otplib/core-async' // alt https://www.npmjs.com/package/otpauth
import { createDigest } from '@otplib/plugin-crypto'
import qrcode from 'qrcode'

const options = {
  id: 'totp',
  serviceName: '1Auth'
}
export default (params) => {
  options.store = authnOptions.store
  options.notify = authnOptions.notify
  options.table = authnOptions.table
  ;(options.secret = {
    ...oneTimeSecret,
    encoding: 'base64'
  }),
    (options.token = {
      ...oneTimeToken,
      algorithm: 'sha512'
    })
  setOptions(options, ['id', 'serviceName'], params)
}

export const authenticate = async (sub, token) => {
  await verifyToken(sub, token)
  return sub
}

export const create = async (sub, onboard = false) => {
  const totp = __totp()
  const secret = await options.secret.create()
  const value = await totp
    .keyuri(sub, options.serviceName, secret)
    .then(
      (otpauth) =>
        otpauth +
        `&digits=${entropyToCharacterLength(
          options.token.entropy,
          options.token.charPool
        )}`
    )
  const id = await authnCreate(options.secret.type, { sub, value }, options)
  if (!onboard) {
    await options.notify('account-totp-create', sub)
  }
  return value
}

export const list = async (sub) => {
  return options.store.selectList(options.table, { sub, type: options.id })
}

export const remove = async (sub, id) => {
  await authnExpire(sub, id, options)
  await options.notify('account-totp-removed', sub)
}

export const __totp = () => {
  return new TOTPAsync({
    algorithm: options.token.algorithm,
    createDigest,
    digits: entropyToCharacterLength(
      options.token.entropy,
      options.token.charPool
    ),
    period: options.token.expire,
    encoding: options.secret.encoding
  })
}

export const urlToQRCode = async (value) => {
  return qrcode.toDataURL(value)
}

export const verifySecret = async (sub, token) => {
  const { id } = await verifyToken(sub, token)
  // TODO update db
  // await authnVerifySecret(sub, id, options)
}

export const verifyToken = async (sub, token) => {
  const totp = __totp()

  options.secret.verify = async (encryptedSecret, token) => {
    const secret = new URL(await decrypt(encryptedSecret)).searchParams.get(
      options.secret.type
    )
    return totp.check(token, secret)
  }
  return authnVerify(options.secret.type, sub, token, options)
}
