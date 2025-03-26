import { promisify } from "node:util";
import {
  randomBytes,
  randomInt,
  randomUUID,
  createHash,
  createCipheriv,
  createDecipheriv,
  createHmac,
  timingSafeEqual,
  generateKeyPair as generateKeyPairCallback,
  sign as signCallback,
  verify as verifyCallback,
} from "node:crypto";
// https://github.com/napi-rs/node-rs/tree/main/packages/argon2
import { hash as secretHash, verify as secretVerify } from "@node-rs/argon2";
import { customAlphabet } from "nanoid";

const generateKeyPair = promisify(generateKeyPairCallback);
const sign = promisify(signCallback);
const verify = promisify(verifyCallback);

const defaults = {
  symmetricEncryptionKey: undefined, // symmetricRandomEncryptionKey()
  symmetricEncryptionAlgorithm: "chacha20-poly1305", // 2025-03: AES-256 GCM (aes-256-gcm) or ChaCha20-Poly1305 (chacha20-poly1305)
  symmetricEncryptionEncoding: undefined, // https://nodejs.org/api/buffer.html#buffers-and-character-encodings
  symmetricSignatureHashAlgorithm: undefined, // fallback to defaultHashAlgorithm
  symmetricSignatureSecret: undefined, // symmetricRandomSignatureSecret()
  symmetricSignatureEncoding: undefined, // fallback to defaultEncoding
  asymmetricKeyNamedCurve: "P-384", // P-512
  asymmetricSignatureHashAlgorithm: undefined, // fallback to defaultHashAlgorithm
  asymmetricSignatureEncoding: undefined, // fallback to defaultEncoding
  digestChecksumHashAlgorithm: undefined, // fallback to defaultHashAlgorithm
  digestChecksumEncoding: undefined,
  digestChecksumSalt: undefined, // randomChecksumSalt()
  digestChecksumPepper: undefined, // randomChecksumPepper()
  defaultEncoding: "base64",
  defaultHashAlgorithm: "sha3-384",
};
const symmetricEncryptionEncodingLengths = {};
const options = {};
export default (opt = {}) => {
  Object.assign(options, defaults, opt);

  // Check options, set defaults
  if (!options.symmetricEncryptionKey) {
    console.warn(
      "@1auth/crypto symmetricEncryptionKey is empty, use a stored secret made from randomBytes(32) Encryption disabled.",
    );
  }
  options.symmetricEncryptionEncoding ??= options.defaultEncoding;
  options.symmetricSignatureHashAlgorithm ??= options.defaultHashAlgorithm;
  if (!options.symmetricSignatureSecret) {
    console.warn(
      "@1auth/crypto symmetricSignatureSecret is empty, use a stored secret made from randomBytes(32). Signature disabled.",
    );
  }
  options.symmetricSignatureEncoding ??= options.defaultEncoding;
  options.asymmetricSignatureHashAlgorithm ??= options.defaultHashAlgorithm;
  options.asymmetricSignatureEncoding ??= options.defaultEncoding;
  if (!options.digestChecksumSalt) {
    console.warn(
      "@1auth/crypto digestChecksumSalt is empty, use a stored secret made from randomBytes(32). Checksum salting disabled.",
    );
  }
  if (!options.digestChecksumPepper) {
    console.warn(
      "@1auth/crypto digestChecksumPepper is empty, use a stored secret made from randomBytes(12). Checksum peppering disabled.",
    );
  }
  options.digestChecksumHashAlgorithm ??= options.defaultHashAlgorithm;
  options.digestChecksumEncoding ??= options.defaultEncoding;

  // Lengths
  symmetricEncryptionEncodingLengths.iv = randomIV().toString(
    options.symmetricEncryptionEncoding,
  ).length;
  symmetricEncryptionEncodingLengths.ivAndAuthTag =
    symmetricEncryptionEncodingLengths.iv +
    randomBytes(16).toString(options.symmetricEncryptionEncoding).length;
};

export const getOptions = () => options;

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
  return Math.ceil((bits * Math.LN2) / Math.log(characterPoolSize));
};
/* export const characterLengthToEntropy = (
  characterLength,
  characterPoolSize,
) => {
  // log_2(characterPoolSize^characterLength)
  return Math.floor(Math.log2(characterPoolSize ** characterLength));
}; */

// *** Random generators *** //
export { randomBytes, randomInt, randomUUID } from "node:crypto";

export const charactersNumeric = "0123456789";
export const charactersAlphaUpper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
export const charactersAlphaLower = "abcdefghijklmnopqrstuvwxyz";
export const charactersAlpha = charactersAlphaUpper + charactersAlphaLower;
export const charactersAlphaNumeric = charactersAlpha + charactersNumeric;
export const charactersDistinguishable = "CDEHKMPRTUWXY012458";

const randomCharactersCache = {
  charactersAlphaNumeric: customAlphabet(charactersAlphaNumeric),
};
export const randomCharacters = (
  length,
  characters = charactersAlphaNumeric,
) => {
  randomCharactersCache[characters] ??= customAlphabet(characters);
  return randomCharactersCache[characters](length);
};

export const randomAlphaNumeric = (characterLength) => {
  return randomCharacters(characterLength, charactersAlphaNumeric);
};

export const randomNumeric = (characterLength) => {
  let value = "";
  for (let i = characterLength; i--; ) {
    value += randomInt(9);
  }
  return value;
};

// *** configs *** //
// Input: {id, prefix, entropy, characters, opt, expire}
// Output: {id, type, opt, expire, create, ...}
export const makeRandomConfigObject = ({
  id,
  prefix = "",
  entropy = 64,
  characters = charactersAlphaNumeric,
  ...params
} = {}) => {
  const minLength = entropyToCharacterLength(entropy, characters.length);
  const config = {
    id,
    type: "id",
    create: () => prefix + randomCharacters(minLength, characters),
    ...params,
  };
  return config;
};

// *** Digests *** //
export const randomChecksumSalt = () => {
  return randomBytes(32); // 256 bits
};
export const randomChecksumPepper = () => {
  return randomIV(); // 96
};

export const createSaltedValue = (value, { checksumSalt } = {}) => {
  checksumSalt ??= options.digestChecksumSalt;
  if (!checksumSalt) {
    return value;
  }
  const newValue = value + checksumSalt;
  return newValue;
};
export const createPepperedValue = (
  value,
  { checksumPepper, encryptionKey } = {},
) => {
  checksumPepper ??= options.digestChecksumPepper;
  encryptionKey ??= options.symmetricEncryptionKey;
  if (!checksumPepper || !encryptionKey) {
    return value;
  }
  const newValue = symmetricEncrypt(value, {
    encryptionKey,
    sub: "",
    iv: checksumPepper,
  });
  return newValue;
};

export const createChecksum = (value, { hashAlgorithm, encoding } = {}) => {
  hashAlgorithm ??= options.digestChecksumHashAlgorithm;
  encoding ??= options.digestChecksumEncoding;
  return createHash(hashAlgorithm).update(value).digest(encoding);
};
export const createSeasonedChecksum = (
  value,
  { hashAlgorithm, encoding, checksumSalt, checksumPepper } = {},
) => {
  return createChecksum(
    createPepperedValue(createSaltedValue(value, { checksumSalt }), {
      checksumPepper,
    }),
    {
      hashAlgorithm,
      encoding,
    },
  );
};

export const createDigest = (value, { hashAlgorithm, encoding } = {}) => {
  hashAlgorithm ??= options.digestChecksumHashAlgorithm;
  const checksum = createChecksum(value, { hashAlgorithm, encoding });
  return `${hashAlgorithm}:${checksum}`;
};
export const createSaltedDigest = (
  value,
  { hashAlgorithm, encoding, checksumSalt } = {},
) => {
  hashAlgorithm ??= options.digestChecksumHashAlgorithm;
  const checksum = createChecksum(createSaltedValue(value, { checksumSalt }), {
    hashAlgorithm,
    encoding,
  });
  return `${hashAlgorithm}:${checksum}`;
};
export const createPepperedDigest = (
  value,
  { hashAlgorithm, encoding, checksumPepper, encryptionKey } = {},
) => {
  hashAlgorithm ??= options.digestChecksumHashAlgorithm;
  const checksum = createChecksum(
    createPepperedValue(value, { checksumPepper, encryptionKey }),
    {
      hashAlgorithm,
      encoding,
    },
  );
  return `${hashAlgorithm}:${checksum}`;
};
export const createSeasonedDigest = (
  value,
  { hashAlgorithm, encoding, checksumSalt, checksumPepper, encryptionKey } = {},
) => {
  hashAlgorithm ??= options.digestChecksumHashAlgorithm;
  const checksum = createSeasonedChecksum(value, {
    hashAlgorithm,
    encoding,
    checksumSalt,
    checksumPepper,
    encryptionKey,
  });
  return `${hashAlgorithm}:${checksum}`;
};

// *** Hashing *** //
const hashOptions = {
  timeCost: 3, // Default 3
  memoryCost: 2 ** 15, // Default 2 ** 12 = 4MB
  saltLength: 16,
  parallelism: 1, // Default 1
  outputLen: 64, // hashLength: 128 // Default 32
  algorithm: 2, // Default 2 = Argon2id
  version: 1, // Default 1 = version 19
};

export const createSecretHash = async (value, options = hashOptions) => {
  return secretHash(value, options);
};

export const verifySecretHash = async (hash, value) => {
  return secretVerify(hash, value);
};

// *** Symmetric Encryption *** //
const authTagLength = 16;

export const symmetricRandomEncryptionKey = () => {
  return randomBytes(32); // 256 bits
};

export const randomIV = () => {
  return randomBytes(12); // 96 bits
};

export const symmetricGenerateEncryptionKey = (
  sub,
  { encryptionKey, signatureSecret } = {},
) => {
  encryptionKey ??= options.symmetricEncryptionKey;
  signatureSecret ??= options.symemeticSignatureSecret;

  const rowEncryptionKey = symmetricRandomEncryptionKey();
  const rowEncryptedKey = symmetricEncrypt(rowEncryptionKey, {
    encryptionKey,
    signatureSecret,
    sub,
  });
  return { encryptionKey: rowEncryptionKey, encryptedKey: rowEncryptedKey };
};

// sub add context to encryption
export const symmetricEncryptFields = (
  values,
  { encryptedKey, encryptionKey, signatureSecret, sub },
  fields = [],
) => {
  if (encryptedKey) {
    encryptionKey ??= symmetricDecryptKey(encryptedKey, {
      signatureSecret,
      sub,
    });
  }
  if (!encryptionKey) return values;
  const encryptedValues = structuredClone(values);
  for (const key of fields) {
    encryptedValues[key] &&= symmetricEncrypt(encryptedValues[key], {
      encryptionKey,
      signatureSecret,
      sub,
    });
  }
  return encryptedValues;
};

export const symmetricEncrypt = (
  data,
  { encryptedKey, encryptionKey, signatureSecret, sub, decoding, encoding, iv },
) => {
  if (encryptedKey) {
    encryptionKey ??= symmetricDecryptKey(encryptedKey, {
      signatureSecret,
      sub,
    });
  }
  if (!encryptionKey || !data) return data;
  decoding ??= "utf8";
  encoding ??= options.symmetricEncryptionEncoding;
  iv ??= randomIV();
  const cipher = createCipheriv(
    options.symmetricEncryptionAlgorithm,
    encryptionKey,
    iv,
    {
      authTagLength,
    },
  );
  cipher.setAAD(sub);
  const encryptedData =
    cipher.update(data, decoding, encoding) + cipher.final(encoding);
  const authTag = cipher.getAuthTag();

  const encryptedDataPacket =
    iv.toString(encoding) + authTag.toString(encoding) + encryptedData;

  // add signature to end
  return symmetricSignatureSign(encryptedDataPacket, { signatureSecret });
};

export const symmetricDecryptFields = (
  encryptedValues,
  { encryptedKey, encryptionKey, signatureSecret, sub },
  fields = [],
) => {
  if (encryptedKey) {
    encryptionKey ??= symmetricDecryptKey(encryptedKey, {
      signatureSecret,
      sub,
    });
  }
  if (!encryptionKey) return encryptedValues;
  const values = structuredClone(encryptedValues);
  for (const key of fields) {
    values[key] &&= symmetricDecrypt(values[key], {
      encryptionKey,
      signatureSecret,
      sub,
    });
  }
  return values;
};

export const symmetricDecryptKey = (
  encryptedKey,
  { sub, encryptionKey, signatureSecret } = {},
) => {
  encryptionKey ??= options.symmetricEncryptionKey;
  signatureSecret ??= options.symemeticSignatureSecret;
  return Buffer.from(
    symmetricDecrypt(encryptedKey, {
      encryptionKey,
      signatureSecret,
      sub,
      encoding: options.symmetricEncryptionEncoding,
    }),
    options.symmetricEncryptionEncoding,
  );
};

export const symmetricDecrypt = (
  encryptedDataPacket,
  { encryptedKey, encryptionKey, signatureSecret, sub, decoding, encoding },
) => {
  if (encryptedKey) {
    encryptionKey ??= symmetricDecryptKey(encryptedKey, {
      signatureSecret,
      sub,
    });
  }
  if (!encryptionKey || !encryptedDataPacket) return encryptedDataPacket;
  decoding ??= options.symmetricEncryptionEncoding;
  encoding ??= "utf8";

  // remove signature when successful
  encryptedDataPacket = symmetricSignatureVerify(encryptedDataPacket, {
    signatureSecret,
  });

  if (encryptedDataPacket === false) {
    throw new Error("Signature incorrect");
  }
  const iv = Buffer.from(
    encryptedDataPacket.substring(0, symmetricEncryptionEncodingLengths.iv),
    decoding,
  );
  const authTag = Buffer.from(
    encryptedDataPacket.substring(
      symmetricEncryptionEncodingLengths.iv,
      symmetricEncryptionEncodingLengths.ivAndAuthTag,
    ),
    decoding,
  );
  const encryptedData = Buffer.from(
    encryptedDataPacket.substring(
      symmetricEncryptionEncodingLengths.ivAndAuthTag,
    ),
    decoding,
  );

  const decipher = createDecipheriv(
    options.symmetricEncryptionAlgorithm,
    encryptionKey,
    iv,
    {
      authTagLength,
    },
  );
  decipher.setAAD(sub);

  decipher.setAuthTag(authTag);
  const data =
    decipher.update(encryptedData, decoding, encoding) +
    decipher.final(encoding);
  return data;
};

// *** Symmetric Signatures *** //
export const symmetricRandomSignatureSecret = () => {
  return randomBytes(32); // 256 bits
};

export const symmetricGenerateSignatureSecret = () => {
  const signatureSecret = symmetricRandomSignatureSecret();
  return { signatureSecret };
};

export const symmetricSignatureSign = (
  data,
  { hashAlgorithm, signatureSecret } = {},
) => {
  signatureSecret ??= options.symmetricSignatureSecret;
  hashAlgorithm ??= options.symmetricSignatureHashAlgorithm;
  const signature = createHmac(hashAlgorithm, signatureSecret)
    .update(data)
    .digest(options.symmetricSignatureEncoding)
    .replace(/=+$/, "");

  const signedData = data + "." + signature;
  return signedData;
};

export const symmetricSignatureVerify = (
  signedData,
  { hashAlgorithm, signatureSecret } = {},
) => {
  if (typeof signedData !== "string") return false;
  let lastIndexOf = signedData.lastIndexOf(".");
  // Test for unsigned
  if (lastIndexOf < 0) {
    lastIndexOf = signedData.length;
  }
  const data = signedData.substring(0, lastIndexOf);
  const signedDataExpected = symmetricSignatureSign(data, {
    hashAlgorithm,
    signatureSecret,
  });
  return safeEqual(signedData, signedDataExpected) && data;
};

// Allow rotation of global encryption key, global signature secret, and row encryption key
export const symmetricRotation = (
  oldEncryptedValues,
  oldOptions, // { encryptionKey, signatureSecret, sub, decoding, encoding }, // old
  oldFields = [],
  newOptions, // { encryptionKey, signatureSecret, sub, decoding, encoding }, // new
  newFields,
  transform = (data) => {
    return data;
  },
) => {
  newOptions ??= oldOptions;
  newFields ??= oldFields;

  if (oldOptions.sub !== newOptions.sub) throw new Error("Mismatching `sub`");

  oldEncryptedValues = structuredClone(oldEncryptedValues);
  // Don't use structuredClone, converts Buffer to Uint8Array ...
  oldOptions = { ...oldOptions };
  newOptions = { ...newOptions };

  // decrypt old encryption key
  const { encryptionKey: oldEncryptedKey } = oldEncryptedValues;
  delete oldEncryptedValues.encryptionKey;

  const oldEncryptionKey = symmetricDecryptKey(oldEncryptedKey, oldOptions);
  oldOptions.encryptionKey = oldEncryptionKey;

  // decrypt
  const data = transform(
    symmetricDecryptFields(
      oldEncryptedValues,
      { ...oldOptions, encryptionKey: oldEncryptionKey },
      oldFields,
    ),
  );

  // rotate encryptionKey
  const { encryptionKey: newEncryptionKey, encryptedKey: newEncryptedKey } =
    symmetricGenerateEncryptionKey(newOptions.sub, newOptions);
  newOptions.encryptionKey = newEncryptionKey;

  // encrypt
  const newEncryptedValues = symmetricEncryptFields(
    data,
    newOptions,
    newFields,
  );
  newEncryptedValues.encryptionKey = newEncryptedKey;

  return newEncryptedValues;
};

// *** Asymmetric Signatures *** //
// asymmetricKeyPairType
export const makeAsymmetricKeys = async () => {
  const { publicKey, privateKey } = await generateKeyPair("ec", {
    namedCurve: options.asymmetricKeyNamedCurve,
    paramEncoding: "named",
    publicKeyEncoding: {
      type: "spki",
      format: "pem",
    },
    privateKeyEncoding: {
      type: "sec1",
      format: "pem",
      // Encryption done at another level for consistency
      // cipher: options.asymmetricEncryptionAlgorithm,
      // passphrase: encryptionKey,
    },
  });
  return { publicKey, privateKey };
};

export const makeAsymmetricSignature = async (
  data,
  privateKey,
  { hashAlgorithm } = {},
) => {
  hashAlgorithm ??= options.asymmetricSignatureHashAlgorithm;
  return (await sign(hashAlgorithm, Buffer.from(data), privateKey)).toString(
    options.asymmetricSignatureEncoding,
  );
};
export const verifyAsymmetricSignature = async (
  data,
  publicKey,
  signature,
  { hashAlgorithm } = {},
) => {
  hashAlgorithm ??= options.asymmetricSignatureHashAlgorithm;
  return await verify(
    hashAlgorithm,
    Buffer.from(data),
    publicKey,
    Buffer.from(signature, options.asymmetricSignatureEncoding),
  );
};

export const safeEqual = (input, expected) => {
  const bufferInput = Buffer.from(input);
  const bufferExpected = Buffer.from(expected);
  return (
    bufferInput.length === bufferExpected.length &&
    timingSafeEqual(bufferInput, bufferExpected)
  );
};
