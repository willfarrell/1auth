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
| `randomId` | `function` | — | Returns an `id` for `insert` when the values carry none |

## API

Implements the [store interface](/docs/packages/store) using DynamoDB operations:

- `exists` — `GetItem` or `Query`
- `select` — `GetItem` or `Query`
- `selectList` — `Query`, following `LastEvaluatedKey` until every page is read
- `insert` — `PutItem` with `attribute_not_exists(sub) and attribute_not_exists(id)`, so an existing key throws `ConditionalCheckFailedException`
- `insertList` — one `TransactWriteItems` of conditional puts, so any existing key throws `TransactionCanceledException` and nothing is written. DynamoDB caps a transaction at 100 items, so a longer list throws before writing anything. A row without an `id` gets one from `randomId`, as `insert` does.
- `update` — `UpdateItem` with `attribute_exists` on the key, and every non-key filter as a condition. A row that doesn't exist or doesn't match is left alone, nothing is created, and it resolves `false`; a write resolves `true`. Filtering on the value just read makes it a compare-and-swap.
- `remove` — `DeleteItem`, with non-key filters as a condition. Without the full key it runs a `Query` first, then deletes every match at once.
- `removeList` — `BatchWriteItem` by `{sub, id: [...]}`. Any other filter, such as `type`, sends it down the `Query`-then-delete route instead, because `BatchWriteItem` takes no condition.

`GetItem` only takes the key, so any other filter on `select` or `exists` is checked against the returned item. A mismatch returns `undefined`.

An array filter becomes `IN (:k_0, :k_1, …)` in the `FilterExpression`. A `null` filter matches an attribute that is missing or stored as NULL, `(attribute_not_exists(#k) or attribute_type(#k, :NULL))`, the same rows `IS NULL` finds on SQL. It is never a key condition, so it filters after the query. A filter value of `undefined` or `[]` throws. `update` and `remove` throw without a filter.

A query needs an equality on a partition key. Filters that give none, such as `{ id: [1, 2] }` alone, throw `filters have no key to query on`.

Batch writes (`removeList`) are sent 25 requests at a time. `UnprocessedItems` are retried 5 times with doubling backoff from 25ms. If any are still left, the call throws.

## Uniqueness

DynamoDB enforces uniqueness only on a table's primary key. The SQL tables put a unique index on `digest`, so two accounts can't hold the same username, or the same WebAuthn credential ID; the DynamoDB tables only have a `digest` secondary index, which is neither unique nor strongly consistent.

`@1auth/account-username` and `@1auth/authn-webauthn` check that a value is free before writing it, which catches every conflict that isn't simultaneous. Two writes of the same value that both pass the check before either lands, or that land within the index's replication lag, can both succeed. The value then belongs to two accounts, and a lookup resolves to whichever the query returns first.

If that matters for your deployment, run the account and authentication tables on a SQL store, or rate limit sign-up and username changes so two writes of one value can't race.

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

`insertList` uses `TransactWriteItems`, which IAM authorizes as the `PutItem` calls inside it. There's no separate action to grant.

## Post-quantum

Performs no cryptography. Values arrive already encrypted and digested, so a stolen table exposes only quantum-resistant ciphertexts and digests. See the full assessment in [Post-quantum](/docs/security/algorithms#post-quantum).
