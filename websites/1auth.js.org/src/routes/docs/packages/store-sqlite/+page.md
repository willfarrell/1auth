---
title: "@1auth/store-sqlite"
description: SQLite storage implementation for embedded and local development use.
---

SQLite storage implementation for embedded and local development use.

## Install

```bash
npm i @1auth/store-sqlite
```

## Usage

```javascript
import * as store from '@1auth/store-sqlite'

store.default({
  client: sqliteDb
})
```

## Configuration options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `client` | `object` | **required** | SQLite client with a `query` method — see the client contract below |
| `timeToLiveExpireOffset` | `number` | `864000` | TTL offset in seconds |
| `timeToLiveKey` | `string` | `"remove"` | Column name for TTL |

## Client contract

```javascript
client.query(sql, parameters) // => rows[]
```

`query` always resolves to an **array of rows**, including for `INSERT`, `UPDATE` and `DELETE`. Statements that return nothing resolve to `[]`. Writes use `RETURNING id`, so `insert` reads `rows[0].id` and `remove` checks `rows[0]`.

## API

Implements the [store interface](/docs/packages/store) using parameterized SQL queries with `?` placeholders.

## Post-quantum

Performs no cryptography. Values arrive already encrypted and digested, so a stolen database exposes only quantum-resistant ciphertexts and digests. See the full assessment in [Post-quantum](/docs/security/algorithms#post-quantum).
