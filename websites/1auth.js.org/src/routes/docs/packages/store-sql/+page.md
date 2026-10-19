---
title: "@1auth/store-sql"
description: Generic SQL storage implementation for any client exposing a query method.
---

Generic SQL storage implementation, for any client exposing a `query` method.

Use it directly when your database speaks standard SQL and you don't need a dialect-specific package. For PostgreSQL, SQLite or Cloudflare D1, prefer the dedicated backend — each is a thin wrapper that calls this package's `createSqlStore` with its dialect's settings.

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

Values are always bound as parameters. Column names can't be, so every key in `values`, `filters` and `fields` must match `^[A-Za-z_][A-Za-z0-9_]*$`. Any other key throws before a statement is built.

Filters are never silently dropped:

- A filter value of `undefined` throws.
- An empty array throws. `{ sub: [] }` would otherwise produce no condition at all.
- `update` and `remove` throw when the filter is empty, instead of touching every row.
- `insert` throws when the primary key already exists (the database's constraint error).
- `update` on a row that doesn't exist changes nothing and resolves `undefined`.

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

```javascript
import { createSqlStore } from '@1auth/store-sql'

const store = createSqlStore({
  id: 'mydb',          // used in log lines: @1auth/store-mydb
  placeholder: '$',    // default "?"
  // default: (client, sql, parameters) => client.query(sql, parameters)
  query: (client, sql, parameters) => client.run(sql, parameters)
})
export default store.default
export const { exists, select, selectList, insert, insertList, update, remove, removeList } = store
```

Each call gets its own options, so two backends loaded in one process never share a client or placeholder. `@1auth/store-postgres` sets `placeholder: "$"`. `@1auth/store-d1` supplies a `query` that reads `prepare(sql).bind(...parameters).all()` into rows.

## Post-quantum

Performs no cryptography. Values arrive already encrypted and digested, so a stolen database exposes only quantum-resistant ciphertexts and digests. See the full assessment in [Post-quantum](/docs/security/algorithms#post-quantum).
