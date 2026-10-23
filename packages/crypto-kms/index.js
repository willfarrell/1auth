// Copyright 2003 - 2026 will Farrell, and 1Auth contributors.
// SPDX-License-Identifier: MIT
import { registerEncryptionKeyProvider } from "@1auth/crypto";
import {
	DecryptCommand,
	GenerateDataKeyCommand,
	KMSClient,
} from "@aws-sdk/client-kms";

export * from "@1auth/crypto";

const defaults = {
	client: undefined,
	keyId: undefined,
	keySpec: "AES_256",
	encoding: "base64",
	name: "kms1",
	log: false,
};
const options = {};

const encryptionContext = (sub) => (sub ? { sub } : undefined);

const prefix = (encryptedKey) => `${options.name}:${encryptedKey}`;

const unprefix = (encryptedKey) => {
	const marker = `${options.name}:`;
	return encryptedKey.startsWith(marker)
		? encryptedKey.substring(marker.length)
		: encryptedKey;
};

export const generateEncryptionKey = async (sub) => {
	const commandParams = {
		KeyId: options.keyId,
		KeySpec: options.keySpec,
		EncryptionContext: encryptionContext(sub),
	};
	if (options.log) {
		options.log("@1auth/crypto-kms GenerateDataKeyCommand", commandParams);
	}
	const { Plaintext, CiphertextBlob } = await options.client.send(
		new GenerateDataKeyCommand(commandParams),
	);
	return {
		encryptionKey: Buffer.from(Plaintext),
		encryptedKey: prefix(
			Buffer.from(CiphertextBlob).toString(options.encoding),
		),
	};
};

export const decryptEncryptionKey = async (encryptedKey, sub) => {
	if (!encryptedKey) return;
	const commandParams = {
		// optional for a symmetric key, but it makes KMS reject a blob minted
		// under any other key, including one an attacker controls
		KeyId: options.keyId,
		CiphertextBlob: Buffer.from(unprefix(encryptedKey), options.encoding),
		EncryptionContext: encryptionContext(sub),
	};
	if (options.log) {
		options.log("@1auth/crypto-kms DecryptCommand", commandParams);
	}
	const { Plaintext } = await options.client.send(
		new DecryptCommand(commandParams),
	);
	return Buffer.from(Plaintext);
};

const asynchronous = (call) => () => {
	throw new Error(
		`@1auth/crypto-kms is asynchronous, use ${call} and pass the resulting encryptionKey`,
	);
};

export default (opt = {}) => {
	Object.assign(options, defaults, opt);
	if (!options.keyId) {
		throw new Error(
			"@1auth/crypto-kms keyId is empty, use a symmetric KMS key ARN or alias.",
		);
	}
	options.client ??= new KMSClient();
	registerEncryptionKeyProvider(options.name, {
		generate: asynchronous("generateEncryptionKey()"),
		decrypt: asynchronous("decryptEncryptionKey()"),
	});
};

export const getOptions = () => options;
