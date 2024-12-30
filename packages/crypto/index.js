import { promisify } from 'node:util'
import {
  randomBytes,
  createHash as checksum,
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
  // symmetricEncryptionKey: randomBytes(32).toString('base64') // 256 bits
  symmetricEncryptionKey: undefined,
  symmetricEncryptionMethod: 'chacha20-poly1305', // 2024-05: AES-256 GCM (aes-256-gcm) or ChaCha20-Poly1305 (chacha20-poly1305)
  symmetricEncryptionEncoding: 'base64', // https://nodejs.org/api/buffer.html#buffers-and-character-encodings
  symmetricSignatureAlgorithm: 'sha3-384',
  // symmetricSignatureSecret: randomBytes(32).toString('base64') // 256 bits
  symmetricSignatureSecret: undefined,
  asymmetricKeyNamedCurve: 'P-384', // P-512
  asymmetricSignatureAlgorithm: 'sha3-384',
  digestAlgorithm: 'sha3-384',
  digestEncoding: 'hex',
  signatureEncoding: 'base64'
}
const symmetricEncryptionEncodingLengths = {}
const options = {}
export default (opt = {}) => {
  Object.assign(options, defaults, opt)
  symmetricEncryptionEncodingLengths.iv = randomBytes(12).toString(
    options.symmetricEncryptionEncoding
  ).length
  symmetricEncryptionEncodingLengths.ivAndAuthTag =
    symmetricEncryptionEncodingLengths.iv +
    randomBytes(16).toString(options.symmetricEncryptionEncoding).length
  if (!options.symmetricEncryptionKey) {
    console.warn(
      "@1auth/crypto symmetricEncryptionKey is empty, use a stored secret made from randomBytes(32).toString('base64'). Encryption disabled."
    )
  }
  if (!options.symmetricSignatureSecret) {
    console.warn(
      "@1auth/crypto symmetricSignatureSecret is empty, use a stored secret made from randomBytes(32).toString('base64'). Signature disabled."
    )
  }
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
// Ref: https://github.com/sindresorhus/crypto-random-string/blob/main/core.js
export const charactersAlphaNumeric = [
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
]
export const charactersDistinguishable = [...'CDEHKMPRTUWXY012458']
export const charactersNumeric = [...'0123456789']

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
export const createChecksum = (value, { algorithm, encoding } = {}) => {
  algorithm ??= options.digestAlgorithm
  encoding ??= options.digestEncoding
  return checksum(algorithm).update(value).digest(encoding)
}
export const createDigest = (value, { algorithm } = {}) => {
  algorithm ??= options.digestAlgorithm
  const checksum = createChecksum(value, { algorithm })
  return `${algorithm}:${checksum}`
}

// TODO evaluate non-iv encryption approach?
// Use encryption as pepper to allow easier rotation of pepper
export const createEncryptedDigest = (value, { algorithm } = {}) => {
  algorithm ??= options.digestAlgorithm
  const digest = createDigest(value, { algorithm })
  // encrypting using the symmetricEncryptionKey instead of
  // the row encryptionKey to allow lookup, must have fixed iv
  return symmetricEncrypt(digest, {
    encryptionKey: options.symmetricEncryptionKey,
    sub: '',
    encoding: options.symmetricEncryptionEncoding,
    iv: Buffer.from(
      options.symmetricEncryptionKey.substring(
        0,
        symmetricEncryptionEncodingLengths.iv
      ),
      options.symmetricEncryptionEncoding
    )
  })
}

export const rotateDigestEncryption = (
  encryptedValue,
  encryptionKey,
  newEncryptionKey
) => {
  const digest = symmetricDecrypt(encryptedValue, {
    encryptionKey,
    sub: '',
    encoding: options.symmetricEncryptionEncoding
  })

  return symmetricEncrypt(digest, {
    encryptionKey: newEncryptionKey,
    sub: '',
    encoding: options.symmetricEncryptionEncoding,
    iv: Buffer.from(
      newEncryptionKey.substring(0, symmetricEncryptionEncodingLengths.iv),
      options.symmetricEncryptionEncoding
    )
  })
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
  return randomBytes(32).toString('base64') // 256 bits
}

export const symmetricGenerateEncryptionKey = (sub) => {
  if (!options.symmetricEncryptionKey) {
    return { encryptionKey: '', encryptedKey: '' }
  }
  const encryptionKey = symmetricRandomEncryptionKey()
  const encryptedKey = symmetricEncrypt(encryptionKey, {
    encryptionKey: options.symmetricEncryptionKey,
    sub,
    decoding: 'base64',
    encoding: options.symmetricEncryptionEncoding
  })
  return { encryptionKey, encryptedKey }
}

// sub add context to encryption
export const symmetricEncryptFields = (
  values,
  { encryptedKey, encryptionKey, sub },
  fields = []
) => {
  if (encryptedKey) {
    encryptionKey ??= symmetricDecryptKey(encryptedKey, {
      sub
    })
  }
  if (!encryptionKey) return values
  const encryptedValues = structuredClone(values)
  for (const key of fields) {
    encryptedValues[key] &&= symmetricEncrypt(encryptedValues[key], {
      encryptionKey,
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
      sub
    })
  }
  if (!encryptionKey || !data) return data
  decoding ??= 'utf8'
  encoding ??= options.symmetricEncryptionEncoding
  iv ??= randomBytes(12) // 96 bits

  const cipher = createCipheriv(
    options.symmetricEncryptionMethod,
    Buffer.from(encryptionKey, 'base64'),
    iv,
    {
      authTagLength
    }
  )
  cipher.setAAD(Buffer.from(sub ?? '', 'utf8'))
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
      sub
    })
  }
  if (!encryptionKey) return encryptedValues
  const values = structuredClone(encryptedValues)
  for (const key of fields) {
    values[key] &&= symmetricDecrypt(values[key], {
      encryptionKey,
      sub
    })
  }
  return values
}

export const symmetricDecryptKey = (encryptedKey, { sub } = {}) => {
  return symmetricDecrypt(encryptedKey, {
    encryptionKey: options.symmetricEncryptionKey,
    sub,
    decoding: options.symmetricEncryptionEncoding,
    encoding: 'base64'
  })
}

export const symmetricDecrypt = (
  encryptedDataPacket,
  { encryptedKey, encryptionKey, signatureSecret, sub, decoding, encoding }
) => {
  if (encryptedKey) {
    encryptionKey ??= symmetricDecryptKey(encryptedKey, {
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
    options.symmetricEncryptionMethod,
    Buffer.from(encryptionKey, 'base64'),
    iv,
    {
      authTagLength
    }
  )
  decipher.setAAD(Buffer.from(sub ?? '', 'utf8'))

  decipher.setAuthTag(authTag)
  const data =
    decipher.update(encryptedData, decoding, encoding) +
    decipher.final(encoding)
  return data
}

// *** Symmetric Signatures *** //
export const symmetricRandomSignatureSecret = () => {
  return randomBytes(32).toString('base64') // 256 bits
}

export const symmetricGenerateSignatureSecret = (sub) => {
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
  // if (typeof data !== 'string') throw new TypeError('data must me a string')
  signatureSecret ??= options.symmetricSignatureSecret
  algorithm ??= options.symmetricSignatureAlgorithm
  const signature = createHmac(algorithm, signatureSecret)
    .update(data)
    .digest(options.signatureEncoding)
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

export const symmetricRotation = (
  encryptedValues,
  oldOptions, // { encryptedKey, encryptionKey, signatureSecret, sub }, // old
  newOptions, // { encryptedKey, encryptionKey, signatureSecret, sub, decoding, encoding, iv }, // new
  fields = []
) => {
  const data = symmetricDecryptFields(encryptedValues, oldOptions, fields)
  const newEncryptedData = symmetricEncryptFields(data, newOptions, fields)
  return newEncryptedData
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
      // cipher: options.asymmetricEncryptionMethod,
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
  algorithm ??= options.asymmetricSignatureAlgorithm
  return (await sign(algorithm, Buffer.from(data), privateKey)).toString(
    options.signatureEncoding
  )
}
export const verifyAsymmetricSignature = async (
  data,
  publicKey,
  signature,
  { algorithm } = {}
) => {
  algorithm ??= options.asymmetricSignatureAlgorithm
  return await verify(
    algorithm,
    Buffer.from(data),
    publicKey,
    Buffer.from(signature, options.signatureEncoding)
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
