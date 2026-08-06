---
title: "@1auth/authn-webauthn"
description: WebAuthn/FIDO2 credential support for passwordless authentication.
---

WebAuthn/FIDO2 credential support for passwordless authentication.

## Install

```bash
npm i @1auth/authn-webauthn
```

## Usage

```javascript
import webauthn from '@1auth/authn-webauthn'

webauthn({
  origin: process.env.ORIGIN,
  name: 'Organization Name',
  userVerification: 'preferred'
})
```

## Configuration options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `origin` | `string` | **required** | Application origin URL |
| `name` | `string` | **required** | Relying party name |
| `residentKey` | `string` | `'discouraged'` | Resident key requirement |
| `userVerification` | `string` | `'preferred'` | User verification level |
| `preferredAuthenticatorType` | `string` | — | `'securityKey'`, `'localDevice'`, or `'remoteDevice'` |
| `notifyId` | `string` | `'authn-webauthn'` | Prefix for the notify template ids: `{notifyId}-create`, `{notifyId}-expire`, `{notifyId}-remove` |

Registration and authentication are always verified with `requireUserVerification: true`.
Set `userVerification: 'required'` so the browser actually performs user verification,
otherwise the ceremony completes in the browser and then fails on verify.

## Authenticator types

`preferredAuthenticatorType` only sends `hints` and `authenticatorAttachment` to the browser.
Nothing stops the user registering something else, so when it is set, `verify` also checks
what actually turned up and rejects a mismatch with `401 Unauthorized`:

| Type | Accepts | Signal |
|------|---------|--------|
| `'securityKey'` | Hardware bound credential | `credentialDeviceType: 'singleDevice'` |
| `'localDevice'` | Syncable passkey on this device | `credentialDeviceType: 'multiDevice'`, `authenticatorAttachment: 'platform'` |
| `'remoteDevice'` | Syncable passkey over hybrid | `credentialDeviceType: 'multiDevice'`, `authenticatorAttachment: 'cross-platform'` |

`authenticatorAttachment` is optional in the spec, so local versus remote is only checked when
the browser reports it. The security relevant split — hardware key versus synced passkey — is
the backup eligibility flag, which is always present.

Pass it per registration to offer more than one choice off a single instance:

```javascript
await webauthn.create(sub, { preferredAuthenticatorType: 'remoteDevice' })
```

## Running PassKey and SecurityKey side by side

The default export configures one shared instance, so calling it twice overwrites the first
config. To run two ceremonies with different policies, use
[`@1auth/authn-webauthn-passkey`](/docs/packages/authn-webauthn-passkey) and
[`@1auth/authn-webauthn-securitykey`](/docs/packages/authn-webauthn-securitykey), each holding its own
`createInstance()` and credential `id`, or call `createInstance()` yourself:

```javascript
import { createInstance } from '@1auth/authn-webauthn'

const passkey = createInstance()
passkey.configure({
  origin: process.env.ORIGIN,
  name: 'Organization Name',
  notifyId: 'authn-webauthn-passkey',
  residentKey: 'required',
  userVerification: 'required',
  preferredAuthenticatorType: 'localDevice',
  secret: passkey.secret({ id: 'WebAuthnPassKey' }),
  token: passkey.token({ id: 'WebAuthnPassKey', expire: 5 * 60 }),
  challenge: passkey.challenge({ id: 'WebAuthnPassKey', expire: 2 * 60 })
})

await passkey.count(sub) // its credentials only
```

Credentials are stored as `{id}-{type}`, so a distinct `id` keeps one instance's credentials
out of another's `list`/`allowCredentials`. Instances share the `@1auth/authn`,
`@1auth/crypto`, and `@1auth/account` singletons — same store, table, and encryption keys.

## The two ceremonies

WebAuthn is two exchanges, and both are three-party: your server never talks to the
authenticator, the browser brokers it. The credential's private key never leaves the device.

### Registration — `create` then `verify`

```
Authenticator          Browser              Your app          authn-webauthn
     │                    │                    │                    │
     │                    │  POST /register    │                    │
     │                    ├───────────────────►│                    │
     │                    │                    │  create(sub)       │
     │                    │                    ├───────────────────►│
     │                    │                    │      excludes any  │
     │                    │                    │      credential    │
     │                    │                    │      already on    │
     │                    │                    │      the account   │
     │                    │  { id, secret }    │◄───────────────────┤
     │                    │◄───────────────────┤   token row stored │
     │                    │                    │   otp, 10min       │
     │ navigator.credentials.create(secret)    │                    │
     │◄───────────────────┤                    │                    │
     │                    │                    │                    │
  ┌──┴───────────────┐    │                    │                    │
  │ user gesture,    │    │                    │                    │
  │ key pair made,   │    │                    │                    │
  │ private half     │    │                    │                    │
  │ never leaves     │    │                    │                    │
  └──┬───────────────┘    │                    │                    │
     │  attestation       │                    │                    │
     ├───────────────────►│                    │                    │
     │                    │  POST /register    │                    │
     │                    │  { response }      │                    │
     │                    ├───────────────────►│                    │
     │                    │                    │  verify(sub, resp) │
     │                    │                    ├───────────────────►│
     │                    │                    │      token is otp: │
     │                    │                    │      consumed, and │
     │                    │                    │      the credential│
     │                    │                    │      is stored     │
     │                    │  201               │◄───────────────────┤
     │                    │◄───────────────────┤                    │
```

### Authentication — `createChallenge` then `authenticate`

```
Authenticator          Browser              Your app          authn-webauthn
     │                    │                    │                    │
     │                    │  POST /login       │                    │
     │                    ├───────────────────►│                    │
     │                    │                    │ createChallenge()  │
     │                    │                    ├───────────────────►│
     │                    │                    │   previous         │
     │                    │                    │   challenges are   │
     │                    │                    │   removed first;   │
     │                    │                    │   one row per      │
     │                    │                    │   credential, each │
     │                    │                    │   otp and 10min    │
     │                    │  { id, secret }    │◄───────────────────┤
     │                    │◄───────────────────┤                    │
     │ navigator.credentials.get(secret)       │                    │
     │◄───────────────────┤                    │                    │
     │  assertion         │                    │                    │
     ├───────────────────►│                    │                    │
     │                    │  POST /login       │                    │
     │                    │  { response }      │                    │
     │                    ├───────────────────►│                    │
     │                    │                    │ authenticate(user, │
     │                    │                    │              resp) │
     │                    │                    ├───────────────────►│
     │                    │                    │   challenge is otp:│
     │                    │                    │   consumed. cleanup│
     │                    │                    │   writes the new   │
     │                    │                    │   signature counter│
     │                    │                    │   back to the      │
     │                    │                    │   credential       │
     │                    │  sub               │◄───────────────────┤
     │                    │◄───────────────────┤                    │
```

Both ceremonies lean on the same property: the challenge and the registration token are stored
as one-time credentials, so a replayed response finds nothing to match against.

## API

### `createInstance()`

Create an independent instance with its own `options`. Returns `{configure, ...}` carrying
every export below. The module's default export is `configure` on a built in instance.

### `token(options)`

Token configuration for registration.

### `secret(options)`

Secret storage configuration for credentials.

### `challenge(options)`

Authentication challenge configuration.

### `count(sub)`

Count WebAuthn credentials for a subject.

### `list(sub)`

List all WebAuthn credentials.

### `select(sub, id)`

Get a specific WebAuthn credential.

### `authenticate(username, input)`

Authenticate a user with a WebAuthn assertion.

### `create(sub, {preferredAuthenticatorType})`

Start the WebAuthn registration process. Returns registration options.
`preferredAuthenticatorType` defaults to the configured value and is enforced on `verify`.

### `verify(sub, response, {name}, notify)`

Verify a WebAuthn registration response and store the credential.

### `createChallenge(sub)`

Generate an authentication challenge for an existing credential.

### `expire(sub, id)`

Expire a WebAuthn credential.

### `remove(sub, id)`

Delete a WebAuthn credential.
