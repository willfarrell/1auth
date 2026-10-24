---
title: "@1auth/notify-sqs"
description: AWS SQS notification implementation for asynchronous message delivery.
---

AWS SQS notification implementation for asynchronous message delivery.

## Install

```bash
npm i @1auth/notify-sqs
```

## Peer dependencies

```bash
npm i @aws-sdk/client-sqs
```

## Usage

```javascript
import * as notify from '@1auth/notify-sqs'

notify.default({
  queueName: process.env.QUEUE_NAME ?? 'notify-queue'
})
```

## Configuration options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `client` | `SQSClient` | `new SQSClient()`, made when configured | Custom SQS client instance |
| `queueName` | `string` | — | SQS queue name |
| `queueUrl` | `string` | — | Full SQS queue URL (alternative to queueName) |
| `log` | `function` | — | Logging function. Gets the queue url, `id`, `sub`, the keys of `data` (never its values) and `options` |

## API

### `trigger(id, sub, data, notifyOptions)`

Send a notification to the configured SQS queue.

The message body is a JSON-stringified object containing:

```json
{
  "id": "template-id",
  "sub": "user-subject",
  "data": { "token": "123456" },
  "options": { "messengers": [{ "type": "email" }] }
}
```

## Encryption at rest

`data` holds one-time codes and `options` can hold addresses, so turn on server-side encryption with a KMS key (SSE-KMS) on the queue, and keep its retention short. The sending role then also needs `kms:GenerateDataKey` and `kms:Decrypt` on that key.

## IAM permissions

The Lambda execution role needs the following SQS permissions:

```json
{
  "Effect": "Allow",
  "Action": ["sqs:SendMessage"],
  "Resource": "arn:aws:sqs:*:*:notify-queue"
}
```

## Post-quantum

Performs no cryptography; it hands messages to SQS (transport encryption is AWS's concern). Nothing to migrate. See the full assessment in [Post-quantum](/docs/security/algorithms#post-quantum).
