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

Implements the [store interface](/docs/packages/store) using parameterized SQL queries with `$` placeholders.

All queries use parameterized statements to prevent SQL injection.
