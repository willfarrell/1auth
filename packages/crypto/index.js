import { promisify } from 'node:util'
import {
  randomBytes,
  createHash as checksum,
  createCipheriv,
  createDecipheriv,
  generateKeyPair as generateKeyPairCallback,
  sign,
  verify
} from 'node:crypto'
// https://github.com/napi-rs/node-rs/tree/main/packages/argon2
import { hash as secretHash, verify as secretVerify } from '@node-rs/argon2'

const options = {
  // randomBytes(32).toString('hex') // 256 bits
  encryptionSharedKey: '',
  encryptionMethod: 'chacha20-poly1305', // AES-256 GCM (aes-256-gcm) or ChaCha20-Poly1305 (chacha20-poly1305)

  digestAlgorithm: 'sha3-384',
  digestSalt: ''
}

export default (params) => {
  Object.assign(options, params)
}

const generateKeyPair = promisify(generateKeyPairCallback)

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

// *** Random generators *** //
export const characterPoolSize = {
  keyboard: 94, // (26 + 10 + 11) * 2
  alphaNumeric: 62, // (26 + 10) * 2
  base64: 64, // (26 * 2 + 10 + 2
  hex: 16,
  numeric: 10
}
// Alt: https://github.com/sindresorhus/crypto-random-string/blob/main/core.js
export const randomAlphaNumeric = (bits) => {
  const characterLength = entropyToCharacterLength(
    bits,
    characterPoolSize.alphaNumeric
  )
  return randomBytes(characterLength * 2)
    .toString('base64')
    .replace(/[^a-zA-Z0-9]/g, '')
    .substring(0, characterLength)
}

export const randomBase64 = (bits) => {
  const characterLength = entropyToCharacterLength(
    bits,
    characterPoolSize.base64
  )
  return randomBytes(characterLength + 1)
    .toString('base64')
    .replace('=', '')
}

export const randomNumeric = (bits) => {
  const characterLength = entropyToCharacterLength(
    bits,
    characterPoolSize.numeric
  )
  const max = 10 ** characterLength
  let value = Math.floor(Math.random() * max).toString()
  if (value === max.toString()) {
    return randomNumeric(bits)
  }
  while (value.length < characterLength) value = '0' + value
  return value
}

export const randomHex = (bits) => {
  const characterLength = entropyToCharacterLength(bits, characterPoolSize.hex)
  return randomBytes(characterLength).toString('hex')
}

// *** configs *** //
export const randomId = {
  type: 'id',
  entropy: 64,
  charPool: characterPoolSize.alphaNumeric,
  // TODO update to use https://github.com/jetpack-io/typeid
  create: async (prefix) =>
    (prefix ? prefix + '_' : '') + randomAlphaNumeric(randomId.entropy)
}

export const subject = {
  type: 'id',
  entropy: 64,
  charPool: characterPoolSize.alphaNumeric,
  create: async (prefix) =>
    (prefix ? prefix + '_' : '') + randomAlphaNumeric(subject.entropy)
}

export const session = {
  type: 'id',
  entropy: 128, // ASVS 3.2.2
  charPool: characterPoolSize.alphaNumeric,
  expire: 15 * 60,
  create: async (prefix) =>
    (prefix ? prefix + '_' : '') + randomAlphaNumeric(session.entropy)
}

export const passwordSecret = {
  type: 'secret',
  entropy: 64,
  charPool: characterPoolSize.keyboard,
  otp: false,
  encode: async (value, encryptedKey, sub) =>
    createSecretHash(value).then((hash) => encrypt(hash, encryptedKey, sub)),
  decode: async (value, encryptedKey, sub) => decrypt(value, encryptedKey, sub),
  verify: async (value, hash) => verifySecretHash(hash, value)
}

// aka Password/Credential Recovery
export const passwordToken = {
  type: 'token',
  entropy: 20,
  charPool: characterPoolSize.numeric,
  otp: true,
  expire: 30,
  create: async () => randomNumeric(passwordToken.entropy),
  encode: async (value, encryptedKey, sub) =>
    createSecretHash(value).then((hash) => encrypt(hash, encryptedKey, sub)),
  decode: async (value, encryptedKey, sub) => decrypt(value, encryptedKey, sub),
  verify: async (value, hash) => verifySecretHash(hash, value)
}

export const oneTimeSecret = {
  type: 'secret',
  entropy: 64, //
  charPool: characterPoolSize.base64,
  otp: false,
  expire: null,
  create: async () => randomBase64(oneTimeSecret.entropy),
  encode: async (value, encryptedKey, sub) => encrypt(value, encryptedKey, sub),
  decode: async (value, encryptedKey, sub) => decrypt(value, encryptedKey, sub)
  // create, hash, verify to be handled within
}
export const oneTimeToken = {
  type: 'token',
  entropy: 20,
  charPool: characterPoolSize.numeric,
  otp: true,
  expire: 30
  // create, hash, verify to be handled within
}

// aka lookup secret
export const recoveryCode = {
  type: 'secret',
  entropy: 112,
  charPool: characterPoolSize.alphaNumeric,
  otp: true,
  create: async () => randomAlphaNumeric(recoveryCode.entropy),
  encode: async (value, encryptedKey, sub) =>
    createSecretHash(value).then((hash) => encrypt(hash, encryptedKey, sub)),
  decode: async (value, encryptedKey, sub) => decrypt(value, encryptedKey, sub),
  verify: async (value, hash) => verifySecretHash(hash, value)
}

export const outOfBandToken = {
  type: 'token',
  entropy: 20,
  charPool: characterPoolSize.numeric,
  otp: true,
  expire: 10 * 60,
  create: async () => randomNumeric(outOfBandToken.entropy),
  encode: async (value, encryptedKey, sub) =>
    createSecretHash(value).then((hash) => encrypt(hash, encryptedKey, sub)),
  decode: async (value, encryptedKey, sub) => decrypt(value, encryptedKey, sub),
  verify: async (value, hash) => verifySecretHash(hash, value)
}

export const accessToken = {
  type: 'secret',
  entropy: 112,
  charPool: characterPoolSize.alphaNumeric,
  otp: false,
  expire: 30 * 24 * 60 * 60, // allow override from user
  create: async () => randomAlphaNumeric(accessToken.entropy),
  encode: async (value, encryptedKey, sub) =>
    createSecretHash(value).then((hash) => encrypt(hash, encryptedKey, sub)),
  decode: async (value, encryptedKey, sub) => decrypt(value, encryptedKey, sub),
  verify: async (value, hash) => verifySecretHash(hash, value)
}

// *** Helpers *** //
export const characterLengthToEntropy = (
  characterLength,
  characterPoolSize
) => {
  // log_2(characterPoolSize^characterLength)
  return Math.round(Math.log2(characterPoolSize ** characterLength))
}

export const entropyToCharacterLength = (bits, characterPoolSize) => {
  // bits*ln(2)/ln(characterPoolSize)
  return Math.round((bits * Math.LN2) / Math.log(characterPoolSize))
}

// *** Digests *** //
export const createDigest = async (value, { algorithm, salt } = {}) => {
  algorithm ??= options.digestAlgorithm
  salt ??= options.digestSalt
  const hash = checksum(algorithm)
    .update(value + salt)
    .digest('hex')
  return `${algorithm}:${hash}`
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

// *** Encryption *** //
const authTagLength = 16

export const makeSymetricKey = (assocData) => {
  if (!options.encryptionSharedKey) {
    return { encryptionKey: '', encryptedKey: '' }
  }
  const encryptionKey = randomBytes(32)
  const encryptedKey = __encrypt(
    encryptionKey,
    Buffer.from(options.encryptionSharedKey, 'hex'),
    assocData,
    'hex',
    'hex'
  )
  return { encryptionKey, encryptedKey }
}

// assocData = sub or id
export const encryptFields = (values, encryptedKey, assocData, fields = []) => {
  // TODO optimize: don't decrypt encryptedKey more than once
  for (const key of fields) {
    values[key] &&= encrypt(values[key], encryptedKey, assocData)
  }
  return values
}

export const encrypt = (data, encryptedKey, assocData) => {
  if (!encryptedKey) return data

  const encryptionKey = __decryptKey(encryptedKey, assocData)
  return __encrypt(
    data,
    Buffer.from(encryptionKey, 'hex'),
    assocData,
    'utf8',
    'hex'
  )
}

const __encrypt = (
  data,
  encryptionKey,
  assocData,
  decoding = 'utf8',
  encoding = 'hex'
) => {
  const iv = randomBytes(12) // 96 bits
  const cipher = createCipheriv(options.encryptionMethod, encryptionKey, iv, {
    authTagLength
  })
  cipher.setAAD(Buffer.from(assocData, 'utf8'))
  const encryptedData =
    cipher.update(data, decoding, encoding) + cipher.final(encoding)
  const authTag = cipher.getAuthTag()
  return (
    iv.toString(encoding) + // 24 char
    authTag.toString(encoding) + // 32 char
    encryptedData
  )
}

export const decryptFields = (values, encryptedKey, assocData, fields = []) => {
  // TODO optimize: don't decrypt encryptedKey more than once
  for (const key of fields) {
    values[key] &&= decrypt(values[key], encryptedKey, assocData)
  }
  return values
}

export const decrypt = (encryptedData, encryptedKey, assocData) => {
  if (!options.encryptionSharedKey || !encryptedKey) return encryptedData
  const encryptionKey = __decryptKey(encryptedKey, assocData)
  const data = __decrypt(
    encryptedData,
    Buffer.from(encryptionKey, 'hex'),
    assocData,
    'hex',
    'utf8'
  )
  return data
}

const __decryptKey = (encryptedKey, assocData) =>
  __decrypt(
    encryptedKey,
    Buffer.from(options.encryptionSharedKey, 'hex'),
    assocData,
    'hex',
    'hex'
  )

const __decrypt = (
  data,
  encryptionKey,
  assocData,
  decoding = 'hex',
  encoding = 'utf8'
) => {
  const iv = Buffer.from(data.substring(0, 24), decoding)
  const authTag = Buffer.from(data.substring(24, 56), decoding)
  const encryptedData = Buffer.from(data.substring(56), decoding)

  const decipher = createDecipheriv(
    options.encryptionMethod,
    encryptionKey,
    iv,
    {
      authTagLength
    }
  )
  decipher.setAAD(Buffer.from(assocData, 'utf8'))
  decipher.setAuthTag(authTag)
  return (
    decipher.update(encryptedData, decoding, encoding) +
    decipher.final(encoding)
  )
}

// *** Signatures *** //
export const makeAsymmetricKeys = async (encryptionKey) => {
  const { publicKey, privateKey } = await generateKeyPair('ec', {
    namedCurve: 'P-384', // P-512
    paramEncoding: 'named',
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem'
    },
    privateKeyEncoding: {
      type: 'sec1',
      format: 'pem',
      // TODO remove encryption for other with sub check?
      cipher: options.encryptionMethod,
      passphrase: encryptionKey
    }
  })
  return { publicKey, privateKey }
}

export const makeSignature = (data, privateKey, algorithm = 'SHA3-384') => {
  return sign(algorithm, Buffer.from(data), privateKey).toString('base64')
}
export const verifySignature = (
  data,
  publicKey,
  signature,
  algorithm = 'SHA3-384'
) => {
  return verify(
    algorithm,
    Buffer.from(data),
    publicKey,
    Buffer.from(signature, 'base64')
  )
}
// const assocData = 'sub'
// const input = 'data'
//
// const {encryptedKey} = makeSymetricKey(assocData)
// const encryptedData = encrypt(input, encryptedKey, assocData)
// const output = decrypt(encryptedData, encryptedKey, assocData)
// console.log(assocData, input, output, encryptedData)

// const assocData = 'tlSIcVp1XEF'
// const encryptionKey =
//   'b9ebfdab6603dd8e151138ec8298aaf8b49bf6d38480f9864e9e72e65c4d8b59.b9f9bc89d7f3ce4aa1e1af469d10508b.aa1b6a682fcc186e867a9cfd'
// const value =
//   '76ebdea75ea529c16f1645d5435413934cbb97378293776cb446331e6d8323865a808b7f0822cd4f36ef6cca57354ea7c955c94d232a55038321184f4294971315fda4b8dc2f33422bbd3a5c978edc0f5bf019f818f0c92f7c570bdc49fe2f71df3856655198b6723fa52697b9225b2e79f04ed80cd35ef61a8e1e06c3751d3f9caa40aa9a41528ce5ab1bfae8ecff0feab784497ccbf2c7dca4461c6b9a74d1ded6233dc38ad75d0fe2f57cfda2bd1d59ed1f8c53de911cf8071dc7cefde7870c303137586bc0c5f85fe93505d9056994a4d8e59df2027b564c303aa723e98ae5934b15039f90d21827ac22b824593f334466622582a2857f04d8bf450310a9924060d113d2ece0259da68376b31a3c2e8a0b79e81f8efe96bf2b7a6b5b1841edca2566a0a89ab80ee6d6ac2ed24e788ad318a1238dfa5b9e965d256935d3aeafe52f986a530b2f9225bbe7a73b43e6515ce789701f501546239460bccc46285f3fcff0c54c2b6df820334a974abea81460fd4ac99a13cb88e296a2275f80f4c783757319417078458977461dd5e101f9f9b7d303578379dc15ee1b549e3fcceffffba895ecc8291d1f82e150ce8e10640fd79f2e0666167ef7d529cd28cb76a72bf2b3e239dbb845bedd39f42c938bbe711542231fb835edb547d919b3c695272f4cd43640eb3bed2b86948278e5aeeb67ef932ef08332730e75752fd5bd247e2dd30470fc493362d2ecac72237dfbf0a1694f8e6b8c18ab24c71eb723a3f610a056a73fea90f4f8660bfc6dec46fa52a55a3d72a5c9b97770bff7d52ea91b97cc643d915341642e201918fcb088986e9134e133519c6575048e3f840622e569fc5fa66e4f0c31681c9de4b1b1f6acb179728bc0a9f9950bf2e0c8d49da835298013977a2f97d7052bcbedbc39b875bbf9a0622ede589810175ab2455ea72a8274659af7066a2c97ba3aacce84531d8685d08b15d3619038997ae459ac916a88bedaf619f574236d1b86b02f29edaf78684c91c6ee45199b861359ee374fecb95be8a85dc012991d22564adeb2ec95f160574858fa010c40ce74077a08f0e681eb4b10a0093e885f115a12469a82b07012ad4e20b836d5711358c47969af89d09c9299edc540321fe897312ca49c9e8f93d50dc68394d0cc1d108f38e3534821b979c405c1f526a3b57651897873aeeb0909b176fb2034f9fdb1d43a8003809af29ff0bdc456a593029c4526b270908ac94b620a7cb8b7da20a6421e0f2671c899c20d78e1e0a1c3ab0b92948c90fca3c36d21a5e53143bc7e061773251364f8ce3b8992b6313c9604dc19c018b9efc6ca8f7c1fe039077fd76775461d1fa3968f51be7e340e3f09b40d6b44c77a7cbf7d71cad2ddea1121b31d27470a38cda8f8d38170a0d8f0b02d56f8e97b2134597d6111ea6670545bd4f7b4e4d6d7cf2fb5b787a68ba8ee84775f06db195f47282d9646dfbdbb57701e2ef5a432b621cb54a70e94de6b7a3f95bfe3c50793e08a27f76f832070fb2d23ed19dcd75f798aeff0c3e76d8215d43e1a8b7e643bffa243691adf2abcd52f465390e92e0344e2f452673f12d50e2ead0496ba76504ae0f78c81f2a2b5a64b39d3fb35f39f178b9a1587d1f07ed28e7696bfc8740f429f6cc35c964ae04ef39c1070eab6415be3aab887ff6192ac4d49ba9b169221b47d73c55f6010dda07a77cbcf54b779d380591786ba70c6d7000af57034539487f801aeb5c097939682e1530bc26c0b030bcab327ddaaaac5c9b969301b6d4ed7f601a46e8431e8cae3800c80c42686fee3b7625742798ced5976d163d2c8aad1bdac36c001e4e246fdb7b4c6850ed99554cfc0c07b7c7acc7659fd042989cc291ec2bd03a59e439860a5c48e430780f9d85c9acb3e85e741e73163f29afb7c43f143e7ada99a4670cbbe2210bfce8d36ee86.a5237f2d798c9f98b26a676794d3c3f6.0f15d0f53657150aeb1462d5'
// const output = decrypt(value, encryptionKey, assocData)
// console.log(output)
// *** TOTP *** //
