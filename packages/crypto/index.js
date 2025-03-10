import { promisify } from 'node:util'
import {
  randomBytes,
  createHash,
  createCipheriv,
  createDecipheriv,
  createHmac,
  timingSafeEqual,
  generateKeyPair as generateKeyPairCallback,
  sign as signCallback,
  verify as verifyCallback
} from 'node:crypto'
// https://github.com/napi-rs/node-rs/tree/main/packages/argon2
import { hash as secretHash, verify as secretVerify } from '@node-rs/argon2'

const generateKeyPair = promisify(generateKeyPairCallback)
const sign = promisify(signCallback)
const verify = promisify(verifyCallback)

const defaults = {
  symmetricEncryptionKey: undefined, // symmetricRandomEncryptionKey()
  symmetricEncryptionAlgorithm: 'chacha20-poly1305', // 2024-05: AES-256 GCM (aes-256-gcm) or ChaCha20-Poly1305 (chacha20-poly1305)
  symmetricEncryptionEncoding: undefined, // https://nodejs.org/api/buffer.html#buffers-and-character-encodings
  symmetricSignatureHashAlgorithm: undefined, // fallback to defaultHashAlgorithm
  symmetricSignatureSecret: undefined, // symmetricRandomSignatureSecret()
  symmetricSignatureEncoding: undefined, // fallback to defaultEncoding
  asymmetricKeyNamedCurve: 'P-384', // P-512
  asymmetricSignatureHashAlgorithm: undefined, // fallback to defaultHashAlgorithm
  asymmetricSignatureEncoding: undefined, // fallback to defaultEncoding
  digestChecksumAlgorithm: undefined, // fallback to defaultHashAlgorithm
  digestChecksumEncoding: undefined,
  digestChecksumSalt: undefined, // randomChecksumSalt()
  digestChecksumPepper: undefined, // randomChecksumPepper()
  defaultEncoding: 'base64',
  defaultHashAlgorithm: 'sha3-384'
}
const symmetricEncryptionEncodingLengths = {}
const options = {}
export default (opt = {}) => {
  Object.assign(options, defaults, opt)

  // Check options, set defaults
  if (!options.symmetricEncryptionKey) {
    console.warn(
      '@1auth/crypto symmetricEncryptionKey is empty, use a stored secret made from randomBytes(32) Encryption disabled.'
    )
  }
  options.symmetricEncryptionEncoding ??= options.defaultEncoding
  options.symmetricSignatureHashAlgorithm ??= options.defaultHashAlgorithm
  if (!options.symmetricSignatureSecret) {
    console.warn(
      '@1auth/crypto symmetricSignatureSecret is empty, use a stored secret made from randomBytes(32). Signature disabled.'
    )
  }
  options.symmetricSignatureEncoding ??= options.defaultEncoding
  options.asymmetricSignatureHashAlgorithm ??= options.defaultHashAlgorithm
  options.asymmetricSignatureEncoding ??= options.defaultEncoding
  if (!options.digestChecksumSalt) {
    console.warn(
      '@1auth/crypto digestChecksumSalt is empty, use a stored secret made from randomBytes(32). Checksum salting disabled.'
    )
  }
  if (!options.digestChecksumPepper) {
    console.warn(
      '@1auth/crypto digestChecksumPepper is empty, use a stored secret made from randomBytes(12). Checksum peppering disabled.'
    )
  }
  options.digestChecksumAlgorithm ??= options.defaultHashAlgorithm
  options.digestChecksumEncoding ??= options.defaultEncoding

  // Lengths
  symmetricEncryptionEncodingLengths.iv = randomIV().toString(
    options.symmetricEncryptionEncoding
  ).length
  symmetricEncryptionEncodingLengths.ivAndAuthTag =
    symmetricEncryptionEncodingLengths.iv +
    randomBytes(16).toString(options.symmetricEncryptionEncoding).length
}

export const getOptions = () => options

// *** entropy *** //
// export const characterPoolSize = (value) => {
//   const chars = value.split('')
//   let min = chars[0].charCodeAt()
//   let max = chars[0].charCodeAt()
//   for(const char of value.split('')) {
//     const code = char.charCodeAt()
//     if (code < min) {
//       min = code
//     } else if (max < code) {
//       max = code
//     }
//   }
//   return max - min
// }

// *** Helpers *** //
// Ref: https://therootcompany.com/blog/how-many-bits-of-entropy-per-character/
export const entropyToCharacterLength = (bits, characterPoolSize) => {
  // bits*ln(2)/ln(characterPoolSize)
  return Math.ceil((bits * Math.LN2) / Math.log(characterPoolSize))
}
/* export const characterLengthToEntropy = (
  characterLength,
  characterPoolSize,
) => {
  // log_2(characterPoolSize^characterLength)
  return Math.floor(Math.log2(characterPoolSize ** characterLength));
}; */

// *** Random generators *** //
export const charactersAlpha = [
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
]
export const charactersNumeric = [...'0123456789']
export const charactersAlphaNumeric = charactersAlpha.concat(charactersNumeric)

// Ref: https://github.com/sindresorhus/crypto-random-string/blob/main/core.js
export const randomCharacters = (
  length,
  characters = charactersAlphaNumeric
) => {
  // Generating entropy is faster than complex math operations, so we use the simplest way
  const characterCount = characters.length
  const maxValidSelector =
    Math.floor(0x1_00_00 / characterCount) * characterCount - 1 // Using values above this will ruin distribution when using modular division
  const entropyLength = 2 * Math.ceil(1.1 * length) // Generating a bit more than required so chances we need more than one pass will be really low
  let string = ''
  let stringLength = 0

  while (stringLength < length) {
    // In case we had many bad values, which may happen for character sets of size above 0x8000 but close to it
    const entropy = new Uint8Array(randomBytes(entropyLength))
    let entropyPosition = 0

    while (entropyPosition < entropyLength && stringLength < length) {
      const entropyValue =
        entropy[entropyPosition] + (entropy[entropyPosition + 1] << 8) // eslint-disable-line no-bitwise
      entropyPosition += 2
      if (entropyValue > maxValidSelector) {
        // Skip values which will ruin distribution when using modular division
        continue
      }

      string += characters[entropyValue % characterCount]
      stringLength++
    }
  }

  return string
}

export const randomAlphaNumeric = (characterLength) => {
  return randomCharacters(characterLength, charactersAlphaNumeric)
}

export const randomNumeric = (characterLength) => {
  return randomCharacters(characterLength, charactersNumeric)
}

// *** configs *** //
export const randomId = {
  type: 'id',
  minLength: entropyToCharacterLength(64, charactersAlphaNumeric.length),
  // TODO update to use https://github.com/jetpack-io/typeid
  create: (prefix) =>
    (prefix ? prefix + '_' : '') + randomAlphaNumeric(randomId.minLength)
}

// *** Digests *** //
export const randomChecksumSalt = () => {
  return randomBytes(32) // 256 bits
}
export const randomChecksumPepper = () => {
  return randomIV() // 96
}

export const createSaltedValue = (value) => {
  if (!options.digestChecksumSalt) {
    return value
  }
  const newValue = value + options.digestChecksumSalt
  return newValue
}
export const createPepperedValue = (value) => {
  if (!options.digestChecksumPepper) {
    return value
  }
  const newValue = symmetricEncrypt(value, {
    encryptionKey: options.symmetricEncryptionKey,
    sub: '',
    iv: options.digestChecksumPepper
  })
  return newValue
}

export const createChecksum = (value, { algorithm, encoding } = {}) => {
  algorithm ??= options.digestChecksumAlgorithm
  encoding ??= options.digestChecksumEncoding
  return createHash(algorithm).update(value).digest(encoding)
}
export const createSeasonedChecksum = (value, { algorithm, encoding } = {}) => {
  return createChecksum(createPepperedValue(createSaltedValue(value)), {
    algorithm,
    encoding
  })
}

export const createDigest = (value, { algorithm, encoding } = {}) => {
  algorithm ??= options.digestChecksumAlgorithm
  const checksum = createChecksum(value, { algorithm, encoding })
  return `${algorithm}:${checksum}`
}
export const createSaltedDigest = (value, { algorithm, encoding } = {}) => {
  algorithm ??= options.digestChecksumAlgorithm
  const checksum = createChecksum(createSaltedValue(value), {
    algorithm,
    encoding
  })
  return `${algorithm}:${checksum}`
}
export const createPepperedDigest = (value, { algorithm, encoding } = {}) => {
  algorithm ??= options.digestChecksumAlgorithm
  const checksum = createChecksum(createPepperedValue(value), {
    algorithm,
    encoding
  })
  return `${algorithm}:${checksum}`
}
export const createSeasonedDigest = (value, { algorithm, encoding } = {}) => {
  algorithm ??= options.digestChecksumAlgorithm
  const checksum = createSeasonedChecksum(value, {
    algorithm,
    encoding
  })
  return `${algorithm}:${checksum}`
}

// *** Hashing *** //
const hashOptions = {
  timeCost: 3,
  memoryCost: 2 ** 16,
  saltLength: 16,
  parallelism: 1,
  outputLen: 64, // hashLength: 128
  algorithm: 2,
  version: 1
}

export const createSecretHash = async (value, options = hashOptions) => {
  return secretHash(value, options)
}

export const verifySecretHash = async (hash, value) => {
  return secretVerify(hash, value)
}

// *** Symmetric Encryption *** //
const authTagLength = 16

export const symmetricRandomEncryptionKey = () => {
  return randomBytes(32) // 256 bits
}

export const randomIV = () => {
  return randomBytes(12) // 96 bits
}

export const symmetricGenerateEncryptionKey = (
  sub,
  { encryptionKey, signatureSecret } = {}
) => {
  encryptionKey ??= options.symmetricEncryptionKey
  signatureSecret ??= options.symemeticSignatureSecret

  if (!encryptionKey) {
    return { encryptionKey: '', encryptedKey: '' }
  }
  const rowEncryptionKey = symmetricRandomEncryptionKey()
  const rowEncryptedKey = symmetricEncrypt(rowEncryptionKey, {
    encryptionKey,
    signatureSecret,
    sub
  })
  return { encryptionKey: rowEncryptionKey, encryptedKey: rowEncryptedKey }
}

// sub add context to encryption
export const symmetricEncryptFields = (
  values,
  { encryptedKey, encryptionKey, signatureSecret, sub },
  fields = []
) => {
  if (encryptedKey) {
    encryptionKey ??= symmetricDecryptKey(encryptedKey, {
      signatureSecret,
      sub
    })
  }
  if (!encryptionKey) return values
  const encryptedValues = structuredClone(values)
  for (const key of fields) {
    encryptedValues[key] &&= symmetricEncrypt(encryptedValues[key], {
      encryptionKey,
      signatureSecret,
      sub
    })
  }
  return encryptedValues
}

export const symmetricEncrypt = (
  data,
  { encryptedKey, encryptionKey, signatureSecret, sub, decoding, encoding, iv }
) => {
  if (encryptedKey) {
    encryptionKey ??= symmetricDecryptKey(encryptedKey, {
      signatureSecret,
      sub
    })
  }
  if (!encryptionKey || !data) return data
  decoding ??= 'utf8'
  encoding ??= options.symmetricEncryptionEncoding
  iv ??= randomIV()
  const cipher = createCipheriv(
    options.symmetricEncryptionAlgorithm,
    encryptionKey,
    iv,
    {
      authTagLength
    }
  )
  cipher.setAAD(sub)
  const encryptedData =
    cipher.update(data, decoding, encoding) + cipher.final(encoding)
  const authTag = cipher.getAuthTag()

  const encryptedDataPacket =
    iv.toString(encoding) + authTag.toString(encoding) + encryptedData

  // add signature to end
  return symmetricSignatureSign(encryptedDataPacket, signatureSecret)
}

export const symmetricDecryptFields = (
  encryptedValues,
  { encryptedKey, encryptionKey, signatureSecret, sub },
  fields = []
) => {
  if (encryptedKey) {
    encryptionKey ??= symmetricDecryptKey(encryptedKey, {
      signatureSecret,
      sub
    })
  }
  if (!encryptionKey) return encryptedValues
  const values = structuredClone(encryptedValues)
  for (const key of fields) {
    values[key] &&= symmetricDecrypt(values[key], {
      encryptionKey,
      signatureSecret,
      sub
    })
  }
  return values
}

export const symmetricDecryptKey = (
  encryptedKey,
  { sub, encryptionKey, signatureSecret } = {}
) => {
  encryptionKey ??= options.symmetricEncryptionKey
  signatureSecret ??= options.symemeticSignatureSecret
  return Buffer.from(
    symmetricDecrypt(encryptedKey, {
      encryptionKey,
      signatureSecret,
      sub,
      encoding: options.symmetricEncryptionEncoding
    }),
    options.symmetricEncryptionEncoding
  )
}

export const symmetricDecrypt = (
  encryptedDataPacket,
  { encryptedKey, encryptionKey, signatureSecret, sub, decoding, encoding }
) => {
  if (encryptedKey) {
    encryptionKey ??= symmetricDecryptKey(encryptedKey, {
      signatureSecret,
      sub
    })
  }
  if (!encryptionKey || !encryptedDataPacket) return encryptedDataPacket
  decoding ??= options.symmetricEncryptionEncoding
  encoding ??= 'utf8'

  // remove signature when successful
  encryptedDataPacket = symmetricSignatureVerify(
    encryptedDataPacket,
    signatureSecret
  )

  if (encryptedDataPacket === false) {
    throw new Error('Signature incorrect')
  }
  const iv = Buffer.from(
    encryptedDataPacket.substring(0, symmetricEncryptionEncodingLengths.iv),
    decoding
  )
  const authTag = Buffer.from(
    encryptedDataPacket.substring(
      symmetricEncryptionEncodingLengths.iv,
      symmetricEncryptionEncodingLengths.ivAndAuthTag
    ),
    decoding
  )
  const encryptedData = Buffer.from(
    encryptedDataPacket.substring(
      symmetricEncryptionEncodingLengths.ivAndAuthTag
    ),
    decoding
  )

  const decipher = createDecipheriv(
    options.symmetricEncryptionAlgorithm,
    encryptionKey,
    iv,
    {
      authTagLength
    }
  )
  decipher.setAAD(Buffer.from(sub, 'utf8'))

  decipher.setAuthTag(authTag)
  const data =
    decipher.update(encryptedData, decoding, encoding) +
    decipher.final(encoding)
  return data
}

// *** Symmetric Signatures *** //
export const symmetricRandomSignatureSecret = () => {
  return randomBytes(32) // 256 bits
}

export const symmetricGenerateSignatureSecret = () => {
  if (!options.symmetricSignatureSecret) {
    return { signatureSecret: '' }
  }
  const signatureSecret = symmetricRandomSignatureSecret()
  return { signatureSecret }
}

export const symmetricSignatureSign = (
  data,
  signatureSecret,
  { algorithm } = {}
) => {
  signatureSecret ??= options.symmetricSignatureSecret
  algorithm ??= options.symmetricSignatureHashAlgorithm
  const signature = createHmac(algorithm, signatureSecret)
    .update(data)
    .digest(options.symmetricSignatureEncoding)
    .replace(/=+$/, '')

  const signedData = data + '.' + signature
  return signedData
}

export const symmetricSignatureVerify = (
  signedData,
  signatureSecret,
  { algorithm } = {}
) => {
  if (typeof signedData !== 'string') return false
  const data = signedData.slice(0, signedData.lastIndexOf('.'))
  const signedDataExpected = symmetricSignatureSign(data, signatureSecret, {
    algorithm
  })
  return safeEqual(signedData, signedDataExpected) && data
}

// Allow rotation of global encryption key, global signature secret, and row encryption key
export const symmetricRotation = (
  oldEncryptedValues,
  oldOptions, // { encryptionKey, signatureSecret, sub, decoding, encoding }, // old
  oldFields = [],
  newOptions, // { encryptionKey, signatureSecret, sub, decoding, encoding }, // new
  newFields = [],
  transform = (data) => {
    return data
  }
) => {
  if (oldOptions.sub !== newOptions.sub) throw new Error('Mismatching `sub`')

  // decrypt old encryption key
  const { encryptionKey: oldEncryptedKey } = oldEncryptedValues
  delete oldEncryptedValues.encryptionKey

  oldOptions.encryptionKey = symmetricDecryptKey(oldEncryptedKey, oldOptions)

  // decrypt
  const data = symmetricDecryptFields(
    oldEncryptedValues,
    oldOptions,
    oldFields
  )

  // rotate encryptionKey
  const { encryptionKey: newEncryptionKey, encryptedKey: newEncryptedKey } =
    symmetricGenerateEncryptionKey(oldOptions.sub, newOptions)

  newOptions.encryptionKey = newEncryptionKey

  // encrypt
  const newEncryptedValues = symmetricEncryptFields(
    data,
    newOptions,
    newFields
  )
  newEncryptedValues.encryptionKey = newEncryptedKey

  return newEncryptedValues
}

// *** Asymmetric Signatures *** //
// asymmetricKeyPairType
export const makeAsymmetricKeys = async () => {
  const { publicKey, privateKey } = await generateKeyPair('ec', {
    namedCurve: options.asymmetricKeyNamedCurve,
    paramEncoding: 'named',
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem'
    },
    privateKeyEncoding: {
      type: 'sec1',
      format: 'pem'
      // Encryption done at another level for consistency
      // cipher: options.asymmetricEncryptionAlgorithm,
      // passphrase: encryptionKey,
    }
  })
  return { publicKey, privateKey }
}

export const makeAsymmetricSignature = async (
  data,
  privateKey,
  { algorithm } = {}
) => {
  algorithm ??= options.asymmetricSignatureHashAlgorithm
  return (await sign(algorithm, Buffer.from(data), privateKey)).toString(
    options.asymmetricSignatureEncoding
  )
}
export const verifyAsymmetricSignature = async (
  data,
  publicKey,
  signature,
  { algorithm } = {}
) => {
  algorithm ??= options.asymmetricSignatureHashAlgorithm
  return await verify(
    algorithm,
    Buffer.from(data),
    publicKey,
    Buffer.from(signature, options.asymmetricSignatureEncoding)
  )
}

export const safeEqual = (input, expected) => {
  const bufferInput = Buffer.from(input)
  const bufferExpected = Buffer.from(expected)
  return (
    bufferInput.length === bufferExpected.length &&
    timingSafeEqual(bufferInput, bufferExpected)
  )
}
