import { outOfBandToken, createDigest, randomId } from '@1auth/crypto'
import { getOptions as messengerOptions } from '@1auth/messenger'
import {
  create as authnCreate,
  verify as authnVerify,
  expire as authnExpire
} from '../../credentials.js'

import { allCountries as telephoneDatabase } from 'country-telephone-data'
import { MaskedRegExp } from 'imask'
// import imask from 'imask/esm/imask.js'
// import 'imask/esm/masked/regexp.js'

// export const regexp = /^\+?[0-9\-()]+$/
// export const jsonSchema = {
//   type: 'string',
//   format: 'phone??'
// }

const options = {
  id: 'phoneNumber',
  // pii: true,
  table: 'messengers',
  store: undefined,
  notify: undefined,
  token: { ...outOfBandToken }
}
export default (params) => {
  Object.assign(options, messengerOptions(), params)
}

export const exists = async (phoneNumber) => {
  return options.store.exists(options.table, {
    digest: await digest(phoneNumber)
  })
}

export const create = async (sub, phoneNumber, onboard = false) => {
  if (!validate(sanitize(phoneNumber))) {
    throw new Error('400 invalid phoneNumber')
  }

  if (await exists(phoneNumber)) {
    await options.notify.trigger('account-phone-number-exists', sub)
    return
  }

  const id = await randomId.create()
  await options.store.insert(options.table, {
    id,
    sub,
    type: options.id,
    value: phoneNumber, // await encrypt(phoneNumber),
    digest: await digest(phoneNumber),
    create: nowInSeconds()
  })
  if (!onboard) {
    await options.notify.trigger('account-phone-number-create', sub)
  }
  return sendToken(sub)
}

export const remove = async (sub, id) => {
  await options.store.remove(options.table, { id, sub })
  await authnExpire(sub, id, options)
  await options.notify.trigger('account-phone-number-removed', sub)
}

export const sendToken = async (sub, id) => {
  if (id) {
    await authnExpire(sub, id, options)
  }
  const token = await options.token.create()
  id = await authnCreate(
    options.token.type,
    { id, sub, value: token },
    options
  )
  await options.notify.trigger('account-phone-number-verify', sub, {
    id,
    token,
    expire: options.token.expire
  })
  return id
}

export const verifyToken = async (sub, token) => {
  const { id } = await authnVerify(options.token.type, sub, token, options)
  await options.store.update(
    options.table,
    { sub, id },
    { verify: nowInSeconds() }
  )
}

export const digest = async (telephoneNumber) => {
  return createDigest(sanitize(telephoneNumber))
}

// TODO move to build script
const regexp = {}
for (const item of telephoneDatabase) {
  if (item.format) {
    item.format = item.format.replace(
      Array.from('.'.repeat(item.dialCode.length)).join(''),
      item.dialCode
    )
  }
  let pattern = item.format ? item.format.replaceAll('-', '-?') : '[0-9]+'

  if (item.hasAreaCodes) {
    pattern.replace('.', '[2-9]')
  }

  pattern = pattern
    .replaceAll('....', '[0-9]{4}')
    .replaceAll('...', '[0-9]{3}')
    .replaceAll('..', '[0-9]{2}')
    .replaceAll('.', '[0-9]{1}')
    .replaceAll('+', '\\+?')

  regexp[item.iso2] = new RegExp('^' + pattern + '$')
}
// End TODO

export const sanitize = (phoneNumber, countryCode) => {
  return new MaskedRegExp({ mask: regexp[countryCode], lazy: true }).doPrepare(
    phoneNumber
  )
}

export const validate = (phoneNumber, countryCode) => {
  if (
    !new MaskedRegExp({ mask: regexp[countryCode] }).doValidate(phoneNumber)
  ) {
    return false
  }
  return true
}

const nowInSeconds = () => Math.floor(Date.now() / 1000)
