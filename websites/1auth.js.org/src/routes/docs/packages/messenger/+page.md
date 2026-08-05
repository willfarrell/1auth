---
title: "@1auth/messenger"
description: Messaging framework for contact method verification (email, phone, etc.).
---

Messaging framework for contact method verification (email, phone, etc.).

## Install

```bash
npm i @1auth/messenger
```

## Usage

```javascript
import messenger from '@1auth/messenger'

messenger({
  store,
  notify,
  encryptedFields: ['value']
})
```

## Configuration options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `store` | `object` | **required** | Storage backend module |
| `notify` | `object` | **required** | Notification module |
| `table` | `object` | — | Table schema definition |
| `encryptedFields` | `string[]` | `["value"]` | Fields to encrypt |
| `idGenerate` | `object` | — | ID generation config |
| `randomId` | `object` | — | Random ID options (prefix: `messenger_`) |
| `notifyId` | `string` | `'messenger'` | Prefix for the notify template ids: `{notifyId}-{type}-exists`, `-verify`, `-create`, `-remove-self`, `-remove` |

## The verification flow

A messenger is only trusted once the owner proves they receive on it. That proof is a
short-lived one-time token delivered *through* the messenger being claimed — the address
verifies itself.

```
User                Your app            @1auth/messenger        @1auth/notify
 │                     │                       │                      │
 │  add address        │                       │                      │
 ├────────────────────►│                       │                      │
 │                     │  create(type, sub,    │                      │
 │                     │         { value,      │                      │
 │                     │           digest })   │                      │
 │                     ├──────────────────────►│                      │
 │                     │        digest lookup: │                      │
 │                     │        already taken  │                      │
 │                     │        by someone     │                      │
 │                     │        else and       │                      │
 │                     │        verified? tell │                      │
 │                     │        THEM, not the  │                      │
 │                     │        caller         │                      │
 │                     │                       │                      │
 │                     │        row stored,    │                      │
 │                     │        verify is NULL │                      │
 │                     │                       │  -verify template    │
 │                     │                       ├─────────────────────►│
 │  token, 6 digits, 10min, sent to the address being claimed         │
 │◄───────────────────────────────────────────────────────────────────┤
 │                     │  id                   │                      │
 │◄────────────────────┤◄──────────────────────┤                      │
 │                     │                       │                      │
 │  enter token        │                       │                      │
 ├────────────────────►│                       │                      │
 │                     │  verifyToken(type,    │                      │
 │                     │    sub, token, id)    │                      │
 │                     ├──────────────────────►│                      │
 │                     │        token is otp:  │                      │
 │                     │        consumed, then │                      │
 │                     │        verify is set  │                      │
 │                     │                       │  -create template,   │
 │                     │                       │  to the ALREADY      │
 │                     │                       │  verified messengers │
 │                     │                       ├─────────────────────►│
 │                     │  ok                   │                      │
 │◄────────────────────┤◄──────────────────────┤                      │
```

Two details worth noticing, because both are deliberate:

**A taken address notifies its owner, not the caller.** If the digest already belongs to a
different, verified subject, `create` returns nothing and sends the `-exists` template to the
existing owner. The caller cannot tell "taken" from "created", so the API does not answer the
question *is this address registered here* — which is the question an enumeration attack asks.

**`createToken` deletes previous tokens first.** Only the newest token for a messenger can be
redeemed, so requesting a second one invalidates the first rather than widening the window.

## API

### `randomId(options)`

Generate a random messenger ID.

### `token(options)`

Token configuration — 6-digit numeric OTP with 10 minute expiry by default.

### `exists(type, value)`

Check if a messenger of the given type and value exists.

### `count(type, sub)`

Count verified messengers of a type for a subject.

### `lookup(type, value)`

Find a messenger by type and value.

### `list(type, sub)`

List all messengers of a type for a subject.

### `select(type, sub, id)`

Get a specific messenger.

### `create(type, sub, values)`

Create a new messenger with a verification token. Triggers a notification with the token.

### `createToken(type, sub, sourceId)`

Generate a new verification token for an existing messenger.

### `verifyToken(type, sub, token, sourceId)`

Verify a token and mark the messenger as verified.

### `remove(type, sub, id)`

Delete a messenger.
