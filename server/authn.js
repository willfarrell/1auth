import * as notify from '../packages/notify-console/index.js'
import * as store from '../packages/store-memory/index.js'
import crypto, {
  symmetricRandomEncryptionKey,
  symmetricRandomSignatureSecret,
  randomChecksumSalt,
  randomChecksumPepper
} from '../packages/crypto/index.js'

import account, { create as accountCreate } from '../packages/account/index.js'

import accountUsername, {
  create as accountUsernameCreate,
  exists as accountUsernameExists
} from '../packages/account-username/index.js'

import authn from '../packages/authn/index.js'
import webauthn from '../packages/authn-webauthn/index.js'
import recoveryCodes from '../packages/authn-recovery-codes/index.js'
import accessToken, {
  exists as accessTokenExists
} from '../packages/authn-access-token/index.js'

crypto({
  symmetricEncryptionKey: symmetricRandomEncryptionKey(),
  symmetricSignatureSecret: symmetricRandomSignatureSecret(),
  digestChecksumSalt: randomChecksumSalt(),
  digestChecksumPepper: randomChecksumPepper()
})
store.default({ log: false })
notify.default({
  client: (id, sub, params) => {
    console.log('notify', { id, sub, params })
  }
})

account({ store, notify, encryptedFields: ['name', 'username', 'privateKey'] })
accountUsername()

authn({
  store,
  notify,
  usernameExists: [accountUsernameExists, accessTokenExists],
  encryptedFields: ['value', 'name']
})
recoveryCodes()
accessToken()

const name = '1Auth'
const origin = 'http://localhost'
webauthn({
  log: false, // console.log,
  name,
  origin
})

export const username = 'username00'
export const sub = await accountCreate()
await accountUsernameCreate(sub, username)

export {
  count as webauthnCount,
  list as webauthnList,
  authenticate as webauthnAuthenticate,
  create as webauthnCreate,
  verify as webauthnVerify,
  createChallenge as webauthnCreateChallenge
} from '../packages/authn-webauthn/index.js'

export {
  count as recoveryCodesCount,
  list as recoveryCodesList,
  create as recoveryCodesCreate,
  update as recoveryCodesUpdate,
  authenticate as recoveryCodesAuthenticate
} from '../packages/authn-recovery-codes/index.js'

export {
  count as accessTokenCount,
  list as accessTokenList,
  create as accessTokenCreate,
  authenticate as accessTokenAuthenticate
} from '../packages/authn-access-token/index.js'
