---
title: "@1auth/store-postgres"
description: PostgreSQL storage implementation for 1auth.
---

PostgreSQL storage implementation.

## Install

```bash
npm i @1auth/store-postgres
```

## Peer dependencies

```bash
npm i pg
```

## Usage

```javascript
import * as store from '@1auth/store-postgres'

store.default({
  client: pgPool
})
```

## Configuration options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `client` | `object` | **required** | PostgreSQL client with a `query` method — see the client contract below |
| `timeToLiveExpireOffset` | `number` | `864000` | TTL offset in seconds |
| `timeToLiveKey` | `string` | `"remove"` | Column name for TTL |

## Client contract

```javascript
client.query(sql, parameters) // => rows[]
```

`query` always resolves to an **array of rows** — `pg`'s `result.rows`, not the result object.

## API

Implements the [store interface](/docs/packages/store) using parameterized SQL queries with `$` placeholders. Built on [`@1auth/store-sql`](/docs/packages/store-sql).

All values are bound as parameters. Column names are checked against `^[A-Za-z_][A-Za-z0-9_]*$` before they're quoted, so a key can't inject SQL. See [`@1auth/store-sql`](/docs/packages/store-sql#api) for the filter rules.

## Post-quantum

Performs no cryptography. Values arrive already encrypted and digested, so a stolen database exposes only quantum-resistant ciphertexts and digests. See the full assessment in [Post-quantum](/docs/security/algorithms#post-quantum).
