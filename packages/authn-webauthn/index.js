import {
  getOptions as authnGetOptions,
  authenticate as authnAuthenticate,
  count as authnCount,
  select as authnSelect,
  list as authnList,
  create as authnCreate,
  createList as authnCreateList,
  update as authnUpdate,
  verify as authnVerify,
  expire as authnExpire,
  remove as authnRemove
} from '@1auth/authn'
import { lookup as accountLookup } from '@1auth/account'

import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
} from '@simplewebauthn/server'
import { isoUint8Array } from '@simplewebauthn/server/helpers'

const id = 'WebAuthn'
// minimumAuthenticateAllowCredentials: 3, // Add fake auth ids
const token = {
  id,
  type: 'token',
  // entropy: 64, // ASVS 2.9.2
  // minLength: entropyToCharacterLength(64, charactersAlphaNumeric.length),
  otp: true,
  expire: 10 * 60,
  // create: async () => randomAlphaNumeric(secret.minLength),
  encode: (value) => JSON.stringify(value),
  decode: (value) => JSON.parse(value),
  verify: async (response, value) => {
    const { verified, registrationInfo } = await verifyRegistrationResponse({
      ...value,
      response
    })
    if (!verified) throw new Error('Failed verifyRegistrationResponse')
    return { registrationInfo: jsonEncodeSecret(registrationInfo) }
  }
}

const secret = {
  id,
  type: 'secret',
  // entropy: 64, // ASVS 2.9.2
  // charPool: characterPoolSize.base64,
  // minLength: entropyToCharacterLength(64, charactersAlphaNumeric.length),
  otp: false,
  encode: (value) => {
    value = jsonEncodeSecret(value)
    value = JSON.stringify(value)
    return value
  },
  decode: (value) => {
    value = JSON.parse(value)
    value = jsonParseSecret(value)
    return value
  }
}

const challenge = {
  id,
  type: 'challenge',
  // entropy: 64, // ASVS 2.9.2
  // minLength: entropyToCharacterLength(112, charactersAlphaNumeric.length),
  otp: true,
  expire: 10 * 60,
  // create: () => randomAlphaNumeric(challenge.minLength),
  encode: (value) => {
    value.authenticator = jsonEncodeSecret(value.authenticator)
    value = JSON.stringify(value)
    return value
  },
  decode: (value) => {
    value = JSON.parse(value)
    value.authenticator = jsonParseSecret(value.authenticator)
    return value
  },
  verify: async (response, value) => {
    const { verified, authenticationInfo } = await verifyAuthenticationResponse(
      {
        ...value,
        credential: value.authenticator.credential,
        response
      }
    )
    if (!verified) throw new Error('Failed verifyAuthenticationResponse')
    value.authenticator.credential.counter = authenticationInfo.newCounter
    value.authenticator = jsonEncodeSecret(value.authenticator)
    return true
  },
  cleanup: async (sub, value, { sourceId } = {}) => {
    const now = nowInSeconds()
    const { encryptionKey } = await options.store.select(
      options.table,
      { id: sourceId, sub },
      ['encryptionKey']
    )

    await authnUpdate(options.secret, sub, {
      id: sourceId,
      encryptedKey: encryptionKey,
      value: value.authenticator,
      update: now,
      lastused: now
    })
  }
}
const defaults = {
  id,
  origin: undefined, // with https://
  name: undefined,
  secret,
  token,
  challenge
}
const options = {}
export default (params) => {
  Object.assign(options, authnGetOptions(), defaults, params)
}
export const getOptions = () => options

export const count = async (sub) => {
  if (options.log) {
    options.log('@1auth/authn-webauthn count(', sub, ')')
  }
  return await authnCount(options.secret, sub)
}

export const list = async (sub) => {
  if (options.log) {
    options.log('@1auth/authn-webauthn list(', sub, ')')
  }
  return await authnList(options.secret, sub)
}

export const authenticate = async (username, input) => {
  if (options.log) {
    options.log('@1auth/authn-webauthn authenticate(', username, input, ')')
  }
  return await authnAuthenticate(options.challenge, username, input)
}

export const create = async (sub) => {
  if (options.log) {
    options.log('@1auth/authn-webauthn create(', sub, ')')
  }
  return await createToken(sub)
}

export const verify = async (sub, response, { name } = {}, notify = true) => {
  if (options.log) {
    options.log(
      '@1auth/authn-webauthn verify(',
      sub,
      response,
      ({ name } = {}),
      notify,
      ')'
    )
  }
  const value = await verifyToken(sub, response)
  const { id } = await authnCreate(options.secret, sub, {
    name,
    value,
    verify: nowInSeconds()
  })

  if (notify) {
    await options.notify.trigger('authn-webauthn-create', sub) // TODO add in user.name
  }
  return { id, secret: value }
}

const createToken = async (sub) => {
  if (options.log) {
    options.log('@1auth/authn-webauthn createToken(', sub, ')')
  }
  const [credentials, account] = await Promise.all([
    authnList(options.secret, sub, undefined, ['encryptionKey', 'value']),
    accountLookup(sub)
  ])
  const excludeCredentials = []
  for (let i = credentials.length; i--;) {
    const credential = credentials[i]
    const value = options.secret.decode(credential.value)
    excludeCredentials.push({
      id: value.credential.id,
      type: 'public-key'
    })
  }

  const registrationOptions = {
    rpName: options.name,
    rpID: new URL(options.origin).hostname,
    userID: isoUint8Array.fromUTF8String(sub),
    userName: account.username ?? 'username',
    attestationType: 'none',
    excludeCredentials,
    // PassKey
    residentKey: 'discouraged', // https://fy.blackhats.net.au/blog/2023-02-02-how-hype-will-turn-your-security-key-into-junk/
    userVerification: 'preferred'
    // extras?
    // timeout
    // pubKeyCredParams: [
    //   {
    //     type: 'public-key',
    //     alg: -8 // EdDSA
    //   },
    //   {
    //     type: 'public-key',
    //     alg: -7 // ES256
    //   },
    //   {
    //     type: 'public-key',
    //     alg: -257 // RS256
    //   }
    // ]
  }
  if (options.log) {
    options.log('@1auth/authn-webauthn createToken', { registrationOptions })
  }
  const secret = await generateRegistrationOptions(registrationOptions)
  const value = {
    expectedChallenge: secret.challenge,
    expectedOrigin: options.origin,
    expectedRPID: new URL(options.origin).hostname,
    requireUserVerification: true // PassKey
  }
  const { id } = await authnCreate(options.token, sub, { value })

  if (options.log) {
    options.log(
      '@1auth/authn-webauthn createToken return',
      JSON.stringify({ id, secret }, null, 2)
    )
  }
  return { id, secret }
}

const verifyToken = async (sub, credential) => {
  if (options.log) {
    options.log('@1auth/authn-webauthn verifyToken(', sub, credential, ')')
  }
  const { registrationInfo } = await authnVerify(
    options.token,
    sub,
    credential
  )
  return registrationInfo
}

export const createChallenge = async (sub) => {
  if (options.log) {
    options.log('@1auth/authn-webauthn createChallenge(', sub, ')')
  }
  // const challenge = options.challenge.create();
  const now = nowInSeconds()

  const credentials = await authnList(options.secret, sub, undefined, [
    'id',
    'encryptionKey',
    'value'
  ])
  const allowCredentials = []
  for (let i = credentials.length; i--;) {
    const credential = credentials[i]
    const authenticator = options.secret.decode(credential.value)
    allowCredentials.push({
      id: authenticator.credential.id,
      type: 'public-key'
    })
  }

  const authenticationOptions = {
    rpID: new URL(options.origin).hostname,
    allowCredentials,
    userVerification: 'preferred'
  }
  const secret = await generateAuthenticationOptions(authenticationOptions)

  const challenges = []
  for (let i = credentials.length; i--;) {
    const credential = credentials[i]
    const authenticator = options.secret.decode(credential.value)
    const value = {
      authenticator,
      expectedChallenge: secret.challenge,
      expectedOrigin: options.origin,
      expectedRPID: new URL(options.origin).hostname,
      requireUserVerification: true // PassKey
    }
    challenges.push({
      sourceId: credential.id,
      value,
      update: now
    })
  }
  const id = await authnCreateList(options.challenge, sub, challenges)

  if (options.log) {
    options.log('@1auth/authn-webauthn createChallenge', { secret }, '')
  }
  return { id, secret }
}

export const expire = async (sub, id) => {
  if (options.log) {
    options.log('@1auth/authn-webauthn remove(', sub, id, ')')
  }
  await authnExpire(options.secret, sub, id)
  await options.notify.trigger('authn-webauthn-expire', sub)
}

export const remove = async (sub, id) => {
  if (options.log) {
    options.log('@1auth/authn-webauthn remove(', sub, id, ')')
  }
  await authnRemove(options.secret, sub, id)
  await options.notify.trigger('authn-webauthn-remove', sub)
}

export const select = async (sub, id) => {
  return await authnSelect(options.secret, sub, id)
}

const jsonEncodeSecret = (value) => {
  // value.credential.id = credentialNormalize(value.credential.id);
  value.credential.publicKey = credentialNormalize(value.credential.publicKey)
  value.attestationObject = credentialNormalize(value.attestationObject)
  return value
}

const jsonParseSecret = (value) => {
  // value.credential.id = credentialBuffer(value.credential.id);
  value.credential.publicKey = credentialBuffer(value.credential.publicKey)
  value.attestationObject = credentialBuffer(value.attestationObject)
  return value
}

const credentialNormalize = (value) => {
  let arr = value.data
  if (!arr) {
    arr = Object.values(value)
  }
  return arr
}

const credentialBuffer = (value) => {
  return Buffer.from(credentialNormalize(value))
}

const nowInSeconds = () => Math.floor(Date.now() / 1000)
