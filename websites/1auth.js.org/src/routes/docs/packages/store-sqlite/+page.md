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
| `client` | `object` | **required** | SQLite client with `query` method |
| `timeToLiveExpireOffset` | `number` | `864000` | TTL offset in seconds |
| `timeToLiveKey` | `string` | `"remove"` | Column name for TTL |

## API

Implements the [store interface](/docs/packages/store) using parameterized SQL queries with `?` placeholders.
