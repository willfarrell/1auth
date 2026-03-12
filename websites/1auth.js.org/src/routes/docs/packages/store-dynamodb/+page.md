---
title: "@1auth/store-dynamodb"
description: AWS DynamoDB storage implementation for serverless persistence.
---

AWS DynamoDB storage implementation for serverless persistence.

## Install

```bash
npm i @1auth/store-dynamodb
```

## Peer dependencies

```bash
npm i @aws-sdk/client-dynamodb @aws-sdk/util-dynamodb
```

## Usage

```javascript
import * as store from '@1auth/store-dynamodb'

store.default({
  timeToLiveExpireOffset: 10 * 24 * 60 * 60 // 10 days
})
```

## Configuration options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `client` | `DynamoDBClient` | auto-created | Custom DynamoDB client |
| `timeToLiveExpireOffset` | `number` | `864000` | TTL offset in seconds |
| `timeToLiveKey` | `string` | `"remove"` | DynamoDB TTL attribute name |
| `randomId` | `object` | — | ID generation options |

## API

Implements the [store interface](/docs/packages/store) using DynamoDB operations:

- `exists` — `GetItem` with projection
- `count` — `Query` with `Select: 'COUNT'`
- `select` — `GetItem` or `Query`
- `selectList` — `Query`
- `insert` — `PutItem`
- `update` — `UpdateItem`
- `remove` — `DeleteItem`

## IAM permissions

```json
{
  "Effect": "Allow",
  "Action": [
    "dynamodb:GetItem",
    "dynamodb:PutItem",
    "dynamodb:UpdateItem",
    "dynamodb:DeleteItem",
    "dynamodb:Query",
    "dynamodb:BatchWriteItem"
  ],
  "Resource": "arn:aws:dynamodb:*:*:table/1auth-*"
}
```
