import { setOptions, nowInSeconds } from '@1auth/common'
import {
  passwordSecret,
  passwordToken,
  entropyToCharacterLength,
  createDigest
} from '@1auth/crypto'
import {
  options as authnOptions,
  create as authnCreate,
  verify as authnVerify,
  expire as authnExpire,
  authenticate as authnAuthenticate,
  verifySecret as authnVerifySecret
} from '@1auth/authn'

import { zxcvbn, zxcvbnOptions } from '@zxcvbn-ts/core'
import zxcvbnCommonPackage from '@zxcvbn-ts/language-common'
import zxcvbnEnPackage from '@zxcvbn-ts/language-en'
import zxcvbnFrPackage from '@zxcvbn-ts/language-fr'

zxcvbnOptions.setOptions({
  dictionary: {
    ...zxcvbnCommonPackage.dictionary,
    ...zxcvbnEnPackage.dictionary,
    ...zxcvbnFrPackage.dictionary
  },
  translations: {
    ...zxcvbnEnPackage.translations,
    ...zxcvbnFrPackage.translations
  },
  graphs: zxcvbnCommonPackage.adjacencyGraphs
})
const options = {
  id: 'password'
}
export default (params) => {
  options.store = authnOptions.store
  options.notify = authnOptions.notify
  options.table = authnOptions.table
  options.secret = passwordSecret
  options.token = passwordToken
  setOptions(options, ['id'], params)
}

export const authenticate = async (username, secret) => {
  // only allow 100 attempts per IP or username per hour
  const { sub } = await authnAuthenticate(username, secret, options)
  return sub
}

export const create = async (sub, password) => {
  if (!(await validate(password))) {
    throw new Error('400 invalid password')
  }

  const id = await authnCreate(
    options.secret.type,
    { sub, value: password },
    options
  )
  return id
}

export const update = async (sub, password) => {
  const id = await create(sub, password)
  await options.store.remove(options.table, { id, sub })
  await options.notify('authn-password-change', sub)
}

export const verifySecret = async (sub, password) => {
  await authnVerify(options.secret.type, sub, password, options)
}

export const sendToken = async (sub, id) => {
  if (id) {
    await authnExpire(sub, id, options)
  }
  const token = await options.token.create()
  await authnCreate(options.token.type, { id, sub, value: token }, options)
  await options.notify('authn-password-recovery-token', sub, { id, token })
}

export const verifyToken = async (sub, token, password) => {
  await authnVerify(options.token.type, sub, token, options)
  await update(sub, password)
}

export const validate = async (value) => {
  validateLength(value)
  await validateStrength(value)
  await validateBreach(value)
  return true
}

export const validateLength = (value) => {
  const minLength = entropyToCharacterLength(
    options.secret.entropy,
    otpions.secret.charPool
  )
  const maxLength = 128
  if (minLength <= value || value <= maxLength) {
    return false
  }
  return true
}

export const validateStrength = async (value) => {
  // https://dropbox.tech/security/zxcvbn-realistic-password-strength-estimation
  // 100char ~= 100ms
  const strength = await zxcvbn(value)
  const score = strength.score
  if (score < 3) {
    return false
  }
  return true
}

export const validateBreach = async (value) => {
  const hash = createDigest(value, 'sha1') // .toUpperCase()
  // TODO check if used in previous breach
  // https://haveibeenpwned.com/API/v3
  // const hashes = fetch(`https://api.pwnedpasswords.com/range/${hash.substring(0,5)}`,{ headers: {'hibp-api-key':''}}).then((res) => res.text())
  // return hashes.indexOf(hash) > -1
}
