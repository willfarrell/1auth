import { describe, it } from 'node:test'
import {
  ok,
  equal,
  notEqual,
  deepEqual,
  notDeepEqual
} from 'node:assert/strict'

import crypto, {
  entropyToCharacterLength,
  charactersAlphaNumeric,
  charactersNumeric,
  randomAlphaNumeric,
  randomNumeric,
  randomId,
  createDigest,
  createEncryptedDigest,
  createSecretHash,
  verifySecretHash,
  symmetricGenerateEncryptionKey,
  symmetricEncryptFields,
  symmetricEncrypt,
  symmetricDecryptFields,
  symmetricDecrypt,
  symmetricDecryptKey,
  symmetricGenerateSignatureSecret,
  symmetricSignatureSign,
  symmetricSignatureVerify,
  symmetricRotation,
  makeAsymmetricKeys,
  makeAsymmetricSignature,
  verifyAsymmetricSignature
  // safeEqual
} from '../crypto/index.js'

crypto({
  symmetricEncryptionKey: 'K6u9kqw3u+w/VxR48wYT21hUY56gDIWgxzL5uPTK9zw=',
  symmetricSignatureSecret: 'B6u9kqw3u+w/VxR48wYT21hUY56gDIWgxzL5uPTK9zw='
})

describe('crypto', () => {
  describe('entropy', () => {
    /*
  ASVS v5.0 (bits)
  2.6.2: 112
  2.6.4: 20
  2.7.6: 20
  2.7.7: 64
  2.9.2: 64
  3.2.2: 128
  */
    it('alphaNumeric', async () => {
      for (const [bits, chars] of Object.entries({
        128: 22,
        112: 19,
        64: 11,
        20: 4
      })) {
        const characterLength = entropyToCharacterLength(
          bits,
          charactersAlphaNumeric.length
        )
        equal(characterLength, chars)
      }
    })
    it('numeric', async () => {
      for (const [bits, chars] of Object.entries({
        128: 39,
        112: 34,
        64: 20,
        19: 6
      })) {
        const characterLength = entropyToCharacterLength(
          bits,
          charactersNumeric.length
        )
        equal(characterLength, chars)
      }
    })
  })

  describe('random', () => {
    const randomAlphaNumericRegExp = /^[A-Za-z0-9]+$/
    it('randomAlphaNumeric', async () => {
      const value = randomAlphaNumeric(64)
      equal(value.length, 64)
      ok(randomAlphaNumericRegExp.test(value))
    })
    const randomNumericRegExp = /^[0-9]+$/
    it('randomNumeric', async () => {
      const value = randomNumeric(6)
      equal(value.length, 6)
      ok(randomNumericRegExp.test(value))
    })
    const randomIdRegExp = /^[A-Za-z0-9]+$/
    it('randomId.create()', async () => {
      const prefix = ''
      const value = randomId.create(prefix)
      equal(value.length, 11)
      ok(randomIdRegExp.test(value))
    })
    it('randomId.create(prefix)', async () => {
      const prefix = 'prefix'
      const value = randomId.create(prefix)
      equal(value.length, prefix.length + 1 + 11)
      ok(new RegExp(`^${prefix}_[A-Za-z0-9]+$`).test(value))
    })
  })

  describe('digest', () => {
    it('createDigest', async () => {
      const digest = createDigest('1auth', { algorithm: 'sha3-256' })
      equal(
        digest,
        'sha3-256:d2e213575f360fa8a0a07dc2adc8a163e7c5acdd6cff56909588c9a023a3843b'
      )
    })
    it('createEncryptedDigest', async () => {
      const digest = createEncryptedDigest('1auth', { algorithm: 'sha3-256' })
      equal(
        digest,
        'K6u9kqw3u+w/VxR4IzZ1O3eJ9tn9H4E3oqzBtw==AzrU/3YXzMTFoVWvHkbcnPuWp2qAHuYOQ0Jn7fl0+11lCpoRtYhOoKfXHqSPcPQ8/1kxNLPJn5qM2jijLw/TOUw44nBRWa9r0g==.I+bLbDcYlllomzoHd50/Cwxmoy2gr2dugC93PQW3g7vqPg1uzsnCH6g8uM9QDGDX'
      )
    })
  })

  describe('hash', () => {
    it('createSecretHash() returns hash that can be verified', async (t) => {
      const value = '1auth'
      const hash = await createSecretHash(value)

      const parts = parseSecretHash(hash)
      equal(parts.type, 'argon2id')
      equal(parts.memoryCost, 65536)
      equal(parts.timeCost, 3)
      equal(parts.parallelism, 1)
      equal(parts.version, 19)
      equal(parts.saltLength, 22)
      equal(parts.hashLength, 86)

      const valid = await verifySecretHash(hash, value)
      ok(valid)
    })

    it('verifySecretHash() should fail when value was not used to create hash', async (t) => {
      const value = '1auth'
      const hash = await createSecretHash(value)

      const parts = parseSecretHash(hash)
      equal(parts.type, 'argon2id')
      equal(parts.memoryCost, 65536)
      equal(parts.timeCost, 3)
      equal(parts.parallelism, 1)
      equal(parts.version, 19)
      equal(parts.saltLength, 22)
      equal(parts.hashLength, 86)

      const valid = await verifySecretHash(hash, value + 'fail')
      ok(!valid)
    })
  })

  describe('symmetric encryption', () => {
    it('Can make encryptionKey/encryptedKey pair', async () => {
      const sub = 'sub_000000'

      const { encryptedKey, encryptionKey } =
        symmetricGenerateEncryptionKey(sub)

      equal(
        symmetricDecryptKey(encryptedKey, { sub }),
        encryptionKey.toString('base64')
      )
    })
    it('Can encrypt and decrypt a string using encryption key', async () => {
      const sub = 'sub_000000'

      const { encryptionKey } = symmetricGenerateEncryptionKey(sub)

      const value = '1auth'
      const encryptedValue = symmetricEncrypt(value, {
        encryptionKey,
        sub
      })
      // t.not(encryptedValue, value) // TODO
      notEqual(encryptedValue, value)
      const decryptedValue = symmetricDecrypt(encryptedValue, {
        encryptionKey,
        sub
      })
      equal(decryptedValue, value)
    })
    it('Can NOT encrypt and decrypt a string using EMPTY encryption key', async () => {
      const sub = 'sub_000000'

      const encryptionKey = ''

      const value = '1auth'
      const encryptedValue = symmetricEncrypt(value, {
        encryptionKey,
        sub
      })
      // t.not(encryptedValue, value) // TODO
      equal(encryptedValue, value)
      const decryptedValue = symmetricDecrypt(encryptedValue, {
        encryptionKey,
        sub
      })
      equal(decryptedValue, value)
    })

    it('Can encrypt and decrypt a string using encrypted key', async () => {
      const sub = 'sub_000000'

      const { encryptedKey, encryptionKey } =
        symmetricGenerateEncryptionKey(sub)

      equal(
        symmetricDecryptKey(encryptedKey, { sub }),
        encryptionKey.toString('base64')
      )

      const value = '1auth'
      const encryptedValue = symmetricEncrypt(value, {
        encryptedKey,
        sub
      })
      notEqual(encryptedValue, value)
      const decryptedValue = symmetricDecrypt(encryptedValue, {
        encryptedKey,
        sub
      })
      equal(decryptedValue, value)
    })
    it('Can NOT encrypt and decrypt a string using EMPTY encrypted key', async () => {
      const sub = 'sub_000000'

      const encryptedKey = ''

      const value = '1auth'
      const encryptedValue = symmetricEncrypt(value, {
        encryptedKey,
        sub
      })
      equal(encryptedValue, value)
      const decryptedValue = symmetricDecrypt(encryptedValue, {
        encryptedKey,
        sub
      })
      equal(decryptedValue, value)
    })
    it('encrypt can be decrypted object fields', async () => {
      const sub = 'sub_000000'
      const fields = ['name']

      const { encryptedKey } = symmetricGenerateEncryptionKey(sub)

      const values = { name: 'pii', create: '2000-01-01' }
      const encryptedValues = symmetricEncryptFields(
        values,
        { encryptedKey, sub },
        fields
      )
      notDeepEqual(encryptedValues, values)
      const decryptedValues = symmetricDecryptFields(
        encryptedValues,
        { encryptedKey, sub },
        fields
      )
      deepEqual(decryptedValues, values)
    })
  })

  describe('symmetric signatures', () => {
    it('Should be able to sign using a encryption key and verify using encryption key', async () => {
      const data = '1auth'
      const signatureSecret = 'secret'
      const signedData = symmetricSignatureSign(data, signatureSecret)
      const valid = symmetricSignatureVerify(signedData, signatureSecret)
      ok(valid)
    })
    it('Should NOT be able to sign using a encryption key and verify using another encryption key', async () => {
      const data = '1auth'
      const signatureSecret = 'secret'
      const signedData = symmetricSignatureSign(data, signatureSecret)
      const valid = symmetricSignatureVerify(
        signedData,
        'not' + signatureSecret
      )
      ok(!valid)
    })
    it('Should NOT be able to sign using a encryption key and verify when input is undefined', async () => {
      const signatureSecret = 'secret'
      const valid = symmetricSignatureVerify(undefined, signatureSecret)
      ok(!valid)
    })
  })

  describe('symmetric rotation', () => {
    it('Should be able to rotate the encryption key', async () => {
      // setup
      const sub = 'sub_000000'
      const fields = ['name']

      const { encryptedKey: oldEncryptionKey } =
        symmetricGenerateEncryptionKey(sub)
      const { encryptedKey: newEncryptionKey } =
        symmetricGenerateEncryptionKey(sub)

      const oldOptions = { encryptedKey: oldEncryptionKey, sub }
      const newOptions = { encryptedKey: newEncryptionKey, sub }

      const values = { name: 'pii', create: '2000-01-01' }
      const oldEncryptedValues = symmetricEncryptFields(
        values,
        oldOptions,
        fields
      )

      // start
      const newEncryptedValues = symmetricRotation(
        oldEncryptedValues,
        oldOptions,
        newOptions,
        fields
      )

      const decryptedValues = symmetricDecryptFields(
        newEncryptedValues,
        newOptions,
        fields
      )
      deepEqual(decryptedValues, values)
    })
    it('Should be able to rotate the signature secret', async () => {
      // setup
      const sub = 'sub_000000'
      const fields = ['name']

      const { signatureSecret: oldSignatureSecret } =
        symmetricGenerateSignatureSecret(sub)
      const { signatureSecret: newSignatureSecret } =
        symmetricGenerateSignatureSecret(sub)

      const oldOptions = { signatureSecret: oldSignatureSecret, sub }
      const newOptions = { signatureSecret: newSignatureSecret, sub }

      const values = { name: 'pii', create: '2000-01-01' }
      const oldEncryptedValues = symmetricEncryptFields(
        values,
        oldOptions,
        fields
      )

      // start
      const newEncryptedValues = symmetricRotation(
        oldEncryptedValues,
        oldOptions,
        newOptions,
        fields
      )

      const decryptedValues = symmetricDecryptFields(
        newEncryptedValues,
        newOptions,
        fields
      )
      deepEqual(decryptedValues, values)
    })
  })

  describe('asymmetric signatures', () => {
    it('Should be able to sign using a private key and verify using public key', async () => {
      const data = '1auth'
      const { publicKey, privateKey } = await makeAsymmetricKeys()
      const signature = await makeAsymmetricSignature(data, privateKey)
      const valid = await verifyAsymmetricSignature(data, publicKey, signature)
      ok(valid)
    })
    it('Should NOT be able to dign using a private key and verify using another public key', async () => {
      const data = '1auth'

      const alice = await makeAsymmetricKeys()
      const bob = await makeAsymmetricKeys()
      const signature = await makeAsymmetricSignature(data, alice.privateKey)
      const valid = await verifyAsymmetricSignature(
        data,
        bob.publicKey,
        signature
      )
      ok(!valid)
    })
  })
})
export const parseSecretHash = (str) => {
  const optionMap = {
    m: 'memoryCost',
    t: 'timeCost',
    p: 'parallelism',
    data: 'associatedData'
  }
  const options = {}
  let [, type, version, config, salt, hash] = str.split('$')

  config.split(',').forEach((pair) => {
    const [key, value] = pair.split('=')
    options[optionMap[key]] = Number.parseInt(value)
  })
  if (version) {
    version = Number.parseInt(version.replace('v=', ''))
  }
  if (options.associatedData) {
    delete options.associatedData
  }
  return {
    ...options,
    type,
    version,
    saltLength: salt.length,
    hashLength: hash.length
  }
}
