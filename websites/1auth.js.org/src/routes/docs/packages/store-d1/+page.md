---
title: "@1auth/store-d1"
description: Cloudflare D1 storage implementation for edge serverless.
---

Cloudflare D1 storage implementation for edge serverless.

## Install

```bash
npm i @1auth/store-d1
```

## Usage

```javascript
import * as store from '@1auth/store-d1'

store.default({
  client: env.DB // D1 database binding
})
```

## Configuration options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `client` | `D1Database` | **required** | Cloudflare D1 database binding |
| `timeToLiveExpireOffset` | `number` | `864000` | TTL offset in seconds |
| `timeToLiveKey` | `string` | `"remove"` | Column name for TTL |

## API

Implements the [store interface](/docs/packages/store) using D1's `prepare().bind().first/all/run()` API with `?` placeholders.
