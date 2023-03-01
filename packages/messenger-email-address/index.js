// import { assign } from 'xstate'

import {
  randomId,
  outOfBandToken,
  createDigest,
  makeSymetricKey,
  encrypt
} from '@1auth/crypto'
import { options as messengerOptions } from '@1auth/messenger'
import {
  create as authnCreate,
  verify as authnVerify,
  expire as authnExpire
} from '@1auth/authn'

import { toASCII } from 'tr46'
// import { fullFormats } from 'ajv-formats/dist/formats.js'

const options = {
  id: 'emailAddress',
  // pii: true,
  usernameBlacklist: ['admin', 'info', 'root', 'sa'],
  optionalDotDomains: [
    'gmail.com',
    'google.com',
    'googlemail.com',
    'yahoodns.net'
  ],
  aliasDomains: { 'pm.me': 'protonmail.com', 'proton.me': 'protonmail.com' }
}

export default (params) => {
  Object.assign(options, messengerOptions, { token: outOfBandToken }, params)
}

export const exists = async (emailAddress) => {
  return options.store.exists(options.table, {
    digest: await __digest(__sanitize(emailAddress))
  })
}

export const lookup = async (emailAddress) => {
  const res = options.store.select(options.table, {
    digest: await __digest(__sanitize(emailAddress))
  }) // TODO verify > 0
  if (!res.verify) return
  return res
}

export const create = async (sub, emailAddress) => {
  const emailAddressSanitized = __sanitize(emailAddress)
  const emailAddressDigest = await __digest(emailAddressSanitized)
  // if (!__validate(emailAddressSanitized)) {
  //  throw new Error('400 invalid emailAddress')
  // }
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

export const list = async (sub) => {
  return options.store.selectList(options.table, { sub, type: options.id })
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
  id = await authnCreate(
    options.token.type,
    { id, sub, value: token },
    options
  )
  await options.notify.trigger('messenger-emailAddress-verify', sub, { token })
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
  await options.notify.trigger('messenger-emailAddress-create', sub) // make sure message not sent when part of onboard
}

export const __digest = async (emailAddress) => {
  return createDigest(emailAddress)
}

export const __sanitize = (emailAddress) => {
  let [username, domain] = emailAddress.split('@')

  // not a valid email
  if (!domain) return emailAddress

  username = username.trimStart().split('+')[0].toLowerCase() // TODO puntycode
  domain = toASCII(domain).trimEnd().toLowerCase()

  if (options.optionalDotDomains.includes(domain)) {
    username = username.replaceAll('.', '')
  }
  if (options.aliasDomains[domain]) {
    domain = options.aliasDomains[domain]
  }

  return `${username}@${domain}`
}

const nowInSeconds = () => Math.floor(Date.now() / 1000)

/* const regexp = fullFormats.email
export const __validate = (emailAddress) => {
  const [, domain] = emailAddress.split('@')
  if (!regexp.test(emailAddress)) {
    // TODO add in error code
    return false
  }
  if (
    options.usernameBlacklist.filter(
      (username) => `${username}@${domain}` === emailAddress
    ).length
  ) {
    // TODO add in error code
    return false
  }
  return true
} */

// export const jsonSchema = {
//   type: 'string',
//   format: 'email'
// }

/* export const states = {
  input: {
    on: {
      submit: { target: 'create' }
    }
  },
  create: {
    invoke: {
      id: 'create',
      src: async (context, event) => {
        return create(event.sub, event.emailAddress)
      },
      onError: {
        target: 'input',
        actions: (context, event) => {
          console.log('onError', { context, event })
        }
      },
      onDone: {
        target: 'enterToken',
        actions: assign({
          emailAddressId: (context, event) => {
            return event.data
          }
        })
      }
    }
  },
  createToken: {
    invoke: {
      id: 'createToken',
      src: async (context, event) => {
        return createToken(event.sub, context.emailAddressId)
      },
      // onError: "input",
      onDone: 'enterToken'
    }
  },
  remove: {
    invoke: {
      id: 'remove',
      src: async (context, event) => {
        return remove(event.sub, context.emailAddressId)
      },
      // onError: "input",
      onDone: {
        target: 'input',
        actions: assign({
          emailAddressId: () => undefined
        })
      }
    }
  },
  enterToken: {
    on: {
      submit: { target: 'verifyToken' },
      resend: { target: 'create' },
      remove: { target: 'remove' }
    }
  },
  verifyToken: {
    invoke: {
      id: 'verifyToken',
      src: async (context, event) => {
        await verifyToken(event.sub, event.token)
      },
      onError: 'enterToken',
      onDone: {
        target: 'success',
        actions: assign({
          emailAddressId: () => undefined
        })
      }
    }
  },
  success: {
    type: 'final',
    exit: [
      assign({
        emailAddress: (context) => (context.emailAddress ?? 0) + 1
      })
    ]
  }
}

export const onboardGuard = (context) => (context.emailAddress ?? 0) < 1
*/
