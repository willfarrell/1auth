---
title: "@1auth/store"
description: Base storage interface that all store implementations follow.
---

Base storage interface that all store implementations follow.

## Overview

Store modules provide a common interface for database operations. All 1auth modules that persist data accept a `store` option pointing to any compatible implementation.

## Available implementations

| Package | Backend | Notes |
|---------|---------|-------|
| [`@1auth/store-dynamodb`](/docs/packages/store-dynamodb) | AWS DynamoDB | Serverless, pay-per-request |
| [`@1auth/store-sql`](/docs/packages/store-sql) | Any SQL database | Generic; the dialect packages below are built on its `createSqlStore` factory |
| [`@1auth/store-postgres`](/docs/packages/store-postgres) | PostgreSQL | Relational, self-hosted |
| [`@1auth/store-sqlite`](/docs/packages/store-sqlite) | SQLite | Embedded, local development |
| [`@1auth/store-d1`](/docs/packages/store-d1) | Cloudflare D1 | Edge, serverless SQLite |

## Common interface

All store implementations provide these methods:

### `exists(table, filters)`

Check if a record exists matching the filters.

**Returns:** the matching record's `sub`, or `undefined`

### `select(table, filters, fields)`

Retrieve a single record.

**Returns:** Record object or `undefined`

### `selectList(table, filters, fields)`

Retrieve multiple records.

**Returns:** Array of record objects

### `insert(table, values)`

Insert a new record. Throws if a record with the same primary key already exists.

**Returns:** the record's `id`

### `insertList(table, rows)`

Insert several records.

**Returns:** `id[]`

### `update(table, filters, values)`

Update the record matching every filter. If nothing matches, nothing changes and no record is created.

**Returns:** `undefined`

### `remove(table, filters)`

Delete the records matching every filter.

**Returns:** `true` if a record was deleted

### `removeList(table, filters)`

Delete the records matching `filters`, where `id` is an array.

## Filters

`filters` is an object of `column: value` pairs, all of which must match. An array value matches any of its items.

Filters are never silently dropped, so a mistake can't widen a query to more rows than intended:

- A value of `undefined` throws.
- An empty array throws.
- `update` and `remove` throw when `filters` is empty.

The SQL stores also throw on any column name that isn't a plain identifier (`^[A-Za-z_][A-Za-z0-9_]*$`).

## Configuration

All stores share common options:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `client` | `object` | — | Database client instance |
| `timeToLiveExpireOffset` | `number` | `864000` (10 days) | TTL offset in seconds |
| `timeToLiveKey` | `string` | `"remove"` | Column/attribute name for TTL |

## Post-quantum

Performs no cryptography. Values arrive already encrypted and digested by the packages above it, so a stolen table exposes only quantum-resistant ChaCha20-Poly1305 ciphertexts and SHA3-384 digests. See the full assessment in [Post-quantum](/docs/security/algorithms#post-quantum).
