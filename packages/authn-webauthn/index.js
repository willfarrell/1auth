import { encrypt, decrypt } from '@1auth/crypto'
import {
  options as authnOptions,
  authenticate as authnAuthenticate,
  create as authnCreate,
  update as authnUpdate,
  verify as authnVerify,
  expire as authnExpire
} from '@1auth/authn'
import { lookup as accountLookup } from '@1auth/account'

import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
} from '@simplewebauthn/server'

const options = {
  id: 'WebAuthn',
  origin: undefined, // with https://
  name: undefined,
  // minimumAuthenticateAllowCredentials: 3, // Add fake auth ids
  secret: {
    type: 'secret',
    // entropy: 64, // ASVS 2.9.2
    // charPool: characterPoolSize.base64,
    otp: false,
    expire: null,
    // create: async () => randomBase64(webauthnSecret.entropy), // client side
    encode: async (data, encryptedKey, sub) =>
      encrypt(JSON.stringify(data), encryptedKey, sub),
    decode: async (encryptedData, encryptedKey, sub) =>
      jsonParseSecret(await decrypt(encryptedData, encryptedKey, sub)),
    verify: async (response, authenticator, rest) => {
      try {
        const { verified, authenticationInfo } =
          await verifyAuthenticationResponse({
            response,
            expectedChallenge: rest.challenge, // TODO not encrypted!!
            expectedOrigin: options.origin,
            expectedRPID: new URL(options.origin).hostname,
            authenticator,
            requireUserVerification: true // PassKey
          })
        if (!verified) throw new Error('Failed verifyAuthenticationResponse')
        authenticator.counter = authenticationInfo.newCounter
        return authenticator
      } catch (e) {
        console.error('webauthn.secret.verify', e)
        return false
      }
    }
  },
  // create challenge
  token: {
    type: 'token',
    // entropy: 64, // ASVS 2.9.2
    // charPool: characterPoolSize.base64,
    otp: true, // Not actually an otp, part of the secret
    expire: 10 * 60,
    // create: async () => randomChallenge(options.token.entropy),
    encode: async (value, encryptedKey, sub) =>
      encrypt(value, encryptedKey, sub),
    decode: async (value, encryptedKey, sub) =>
      decrypt(value, encryptedKey, sub),
    verify: async (response, expectedChallenge) => {
      try {
        const { verified, registrationInfo } = await verifyRegistrationResponse(
          {
            response,
            expectedChallenge,
            expectedOrigin: options.origin,
            expectedRPID: new URL(options.origin).hostname,
            requireUserVerification: true // PassKey
          }
        )
        if (!verified) throw new Error('Failed verifyRegistrationResponse')
        // registrationInfo.challenge = expectedChallenge
        return jsonEncodeSecret(registrationInfo)
      } catch (e) {
        console.error('webauthn.token.verify', e)
        return false
      }
    }
  }
}

export default (params) => {
  Object.assign(options, authnOptions, params)
}

// to be sent to client
export const authenticateOptions = async (sub) => {
  const userAuthenticators = await options.store.selectList(
    options.table,
    { sub, type: options.id + '-' + options.secret.type }
    // [ 'value' ]
  )
  const allowCredentials = []
  const id = []
  for (const credential of userAuthenticators) {
    const value = await options.secret.decode(
      credential.value,
      credential.encryptionKey,
      sub
    )
    id.push(credential.id)
    allowCredentials.push({
      id: value.credentialID,
      type: 'public-key'
    })
  }
  /* while (
    allowCredentials.length < options.minimumAuthenticateAllowCredentials
  ) {
    const id = randomAlphaNumeric(256) // 43 char - make hash from username to make static
    allowCredentials.push({
      id,
      type: 'public-key'
    })
  } */

  const clientOptions = generateAuthenticationOptions({
    allowCredentials,
    userVerification: 'preferred'
  })
  // TODO find a better way, not efficient or save as it's own OTP
  await options.store.update(
    options.table,
    { id, sub },
    {
      challenge: clientOptions.challenge, // TODO not encrypted!!
      update: nowInSeconds()
    }
  )
  return clientOptions
}

export const authenticate = async (username, secret) => {
  const { sub, id, encryptionKey, ...value } = await authnAuthenticate(
    username,
    secret,
    options
  )
  await authnUpdate(
    options.secret.type,
    { sub, id, encryptionKey, value, lastused: nowInSeconds() },
    options
  )
  return sub
}

export const createToken = async (sub) => {
  // const token = await options.token.create()

  const userAuthenticators = await options.store.selectList(options.table, {
    sub,
    type: options.id + '-' + options.secret.type
  })
  const excludeCredentials = []
  for (const credential of userAuthenticators) {
    const value = await options.secret.decode(
      credential.value,
      credential.encryptionKey,
      sub
    )
    excludeCredentials.push({
      id: value.credentialID,
      type: 'public-key'
    })
  }

  let { username } = await accountLookup(sub)
  username ??= 'username'
  /* console.log(username, userAuthenticators, {
    rpName: options.name,
    rpID: new URL(options.origin).hostname,
    userID: sub,
    userName: username,
    attestationType: 'none',
    excludeCredentials,
    // PassKey
    residentKey: 'required',
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
  }) */

  const clientOptions = generateRegistrationOptions({
    rpName: options.name,
    rpID: new URL(options.origin).hostname,
    userID: sub,
    userName: username,
    attestationType: 'none',
    excludeCredentials,
    // PassKey
    residentKey: 'required',
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
  })
  await authnCreate(
    options.token.type,
    { sub, value: clientOptions.challenge },
    options
  )
  return clientOptions // needs to be sent to the client
}

export const verifyToken = async (sub, credential) => {
  const { id, ...value } = await authnVerify(
    options.token.type,
    sub,
    credential,
    options
  )
  delete value.sub
  await authnExpire(sub, id, options)
  return value
}

export const create = async (sub, name, value, onboard = false) => {
  await authnCreate(
    options.secret.type,
    { sub, name, value, verify: nowInSeconds() },
    options
  )

  if (!onboard) {
    await options.notify.trigger('account-webauthn-create', sub) // TODO add in user.name
  }
}

export const list = async (sub, type = options.id + '-secret') => {
  return options.store.selectList(options.table, { sub, type })
}

export const remove = async (sub, id) => {
  await authnExpire(sub, id, options)
  await options.notify.trigger('account-webauthn-remove', sub)
}

const jsonEncodeSecret = (value) => {
  value.credentialID = credentialNormalize(value.credentialID)
  value.credentialPublicKey = credentialNormalize(value.credentialPublicKey)
  value.attestationObject = credentialNormalize(value.attestationObject)
}

const jsonParseSecret = (value) => {
  value = JSON.parse(value)

  value.credentialID = credentialBuffer(value.credentialID)
  value.credentialPublicKey = credentialBuffer(value.credentialPublicKey)
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
