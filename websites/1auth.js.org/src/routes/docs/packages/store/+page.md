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
| [`@1auth/store-postgres`](/docs/packages/store-postgres) | PostgreSQL | Relational, self-hosted |
| [`@1auth/store-sqlite`](/docs/packages/store-sqlite) | SQLite | Embedded, local development |
| [`@1auth/store-d1`](/docs/packages/store-d1) | Cloudflare D1 | Edge, serverless SQLite |

## Common interface

All store implementations provide these methods:

### `exists(table, filters)`

Check if a record exists matching the filters.

**Returns:** `boolean`

### `count(table, filters)`

Count records matching the filters.

**Returns:** `number`

### `select(table, filters, fields)`

Retrieve a single record.

**Returns:** Record object or `undefined`

### `selectList(table, filters, fields)`

Retrieve multiple records.

**Returns:** Array of record objects

### `insert(table, values)`

Insert a new record.

### `update(table, filters, values)`

Update an existing record.

### `remove(table, filters)`

Delete a record.

## Configuration

All stores share common options:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `client` | `object` | — | Database client instance |
| `timeToLiveExpireOffset` | `number` | `864000` (10 days) | TTL offset in seconds |
| `timeToLiveKey` | `string` | `"remove"` | Column/attribute name for TTL |
