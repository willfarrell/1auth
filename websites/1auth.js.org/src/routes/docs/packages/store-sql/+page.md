---
title: "@1auth/store-sql"
description: Generic SQL storage implementation for any client exposing a query method.
---

Generic SQL storage implementation, for any client exposing a `query` method.

Use it directly when your database speaks standard SQL and you don't need a dialect-specific package. For PostgreSQL, SQLite or Cloudflare D1, prefer the dedicated backend — each is this package customized for that dialect, with no dependency on it.

## Install

```bash
npm i @1auth/store-sql
```

## Usage

```javascript
import * as store from '@1auth/store-sql'

store.default({
  client: myDb
})
```

## Configuration options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `client` | `object` | **required** | Client with a `query` method — see the client contract below |
| `placeholder` | `string` | `"?"` | `"?"` for positional placeholders, `"$"` for `$1`-numbered |
| `timeToLiveExpireOffset` | `number` | `864000` | TTL offset in seconds |
| `timeToLiveKey` | `string` | `"remove"` | Column name for TTL |
| `log` | `function` \| `false` | `false` | Called with each operation and its arguments |

## Client contract

```javascript
client.query(sql, parameters) // => rows[]
```

One method, and it always resolves to an **array of rows** — including for `INSERT`, `UPDATE` and `DELETE`. Statements that return nothing resolve to `[]`. Writes use `RETURNING id`, so `insert` reads `rows[0].id` and `remove` checks `rows[0]`.

A client that returns a bare row rather than a one-element array for writes will break `insert` and `remove`.

## API

Implements the [store interface](/docs/packages/store) using parameterized SQL. Generated statements quote identifiers (`"column"`), use `LIMIT 1` for single reads, and `RETURNING id` for `INSERT` and `DELETE`.

Beyond the store interface, the statement builders are exported so a backend for a different client shape can reuse them:

| Export | Purpose |
|--------|---------|
| `makeSqlPartsFor(placeholder, filters, values, fields, idxStart)` | Builds `select`, `insert`, `update`, `where` fragments and the parameter array |
| `makeInsertList(placeholder, valuesList)` | Single multi-row `INSERT ... VALUES (?),(?)` |
| `getPlaceholderFor(placeholder, idx)` | `?`, or `$1`-style when `placeholder` is `"$"` |
| `makeValues(values, options)` | Clone, derive the TTL column, then normalize — applied to every write |
| `withTimeToLive(values, options)` | Derives the TTL column from `expire` |
| `normalizeValues(values)` / `parseValues(values)` | Seconds ↔ ISO timestamps, `otp` boolean ↔ integer, objects ↔ JSON |
| `log(options, method, ...args)` | Logging helper honouring `options.log` |

`getPlaceholder(idx)` and `makeSqlParts(filters, values, fields, idxStart)` are also exported — the same two builders bound to this store's configured `placeholder`. They exist for the test suite; prefer the `*For` variants.

## Writing a backend

Copy `index.js` and change what differs. `@1auth/store-postgres` changes two values (`id`, `placeholder`); `@1auth/store-d1` keeps the builders and replaces the operations, because D1 binds prepared statements rather than exposing `query`.

Each backend carrying its own copy is deliberate: none of them take a runtime dependency on another store package, and every operation stays a top-level export so bundlers can tree shake per operation. The trade is real — a fix to a shared builder has to be applied in each copy.
