import { setOptions, nowInSeconds } from '@1auth/common'
import { encrypt, decrypt } from '@1auth/crypto'
import {
  options as authnOptions,
  authenticate as authnAuthenticate,
  create as authnCreate,
  update as authnUpdate,
  verify as authnVerify,
  expire as authnExpire
} from '@1auth/authn'

import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
} from '@simplewebauthn/server'

const options = {
  id: 'webAuthn',
  origin: undefined, // with https://
  rpID: undefined,
  rpName: undefined, // rp name
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
    verify: async (credential, authenticator, rest) => {
      try {
        const { verified, authenticationInfo } =
          await verifyAuthenticationResponse({
            credential,
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
    verify: async (credential, expectedChallenge) => {
      try {
        const { verified, registrationInfo } = await verifyRegistrationResponse(
          {
            credential,
            expectedChallenge,
            expectedOrigin: options.origin,
            expectedRPID: new URL(options.origin).hostname,
            requireUserVerification: true // PassKey
          }
        )
        if (!verified) throw new Error('Failed verifyRegistrationResponse')
        // registrationInfo.challenge = expectedChallenge
        return registrationInfo
      } catch (e) {
        console.error('webauthn.token.verify', e)
        return false
      }
    }
  }
}

export default (params) => {
  options.store = authnOptions.store
  options.notify = authnOptions.notify
  options.table = authnOptions.table
  setOptions(options, ['id', 'origin', 'name'], params)
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
  const clientOptions = generateAuthenticationOptions({
    allowCredentials,
    userVerification: 'preferred'
  })
  // TODO find a better way, not efficient
  await options.store.update(
    options.table,
    { id },
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
  // Update `counter`
  await authnUpdate(
    options.secret.type,
    { sub, id, encryptionKey, value },
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

  const { username } = await options.store.select('accounts', { sub })
  console.log(username, userAuthenticators, {
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

export const create = async (sub, value, onboard = false) => {
  await authnCreate(
    options.secret.type,
    { sub, value, verify: nowInSeconds() },
    options
  )

  if (!onboard) {
    await options.notify('account-webauthn-create', sub) // TODO add in user.name
  }
}

export const remove = async (sub, id) => {
  await authnExpire(sub, id, options)
  await options.notify('account-webauthn-remove', sub)
}

const jsonParseSecret = (value) => {
  value = JSON.parse(value)
  value.credentialID = Buffer.from(value.credentialID.data)
  value.credentialPublicKey = Buffer.from(value.credentialPublicKey.data)
  value.attestationObject = Buffer.from(value.attestationObject.data)
  return value
}
