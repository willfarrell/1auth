import {
  passwordSecret,
  passwordToken,
  entropyToCharacterLength
  // createDigest
} from '@1auth/crypto'
import {
  options as authnOptions,
  create as authnCreate,
  verify as authnVerify,
  expire as authnExpire,
  authenticate as authnAuthenticate
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
  Object.assign(
    options,
    authnOptions,
    { secret: passwordSecret, token: passwordToken },
    params
  )
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
  await options.notify.trigger('authn-password-change', sub)
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
  await options.notify.trigger('authn-password-recovery-token', sub, {
    id,
    token
  })
}

export const verifyToken = async (sub, token, password) => {
  await authnVerify(options.token.type, sub, token, options)
  await update(sub, password)
}

export const validate = async (value) => {
  let valid = false
  valid ||= validateLength(value)
  valid ||= await validateStrength(value)
  valid ||= await validateBreach(value)
  return valid
}

export const validateLength = (value) => {
  const minLength = entropyToCharacterLength(
    options.secret.entropy,
    options.secret.charPool
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
  // const hash = createDigest(value, {algorithm:'sha1', salt: ''}) // .toUpperCase()
  // TODO check if used in previous breach
  // https://haveibeenpwned.com/API/v3
  // const hashes = fetch(`https://api.pwnedpasswords.com/range/${hash.substring(0,5)}`,{ headers: {'hibp-api-key':''}}).then((res) => res.text())
  // return hashes.indexOf(hash) > -1
}
