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
| `client` | `SQSClient` | — | Custom SQS client instance |
| `queueName` | `string` | — | SQS queue name |
| `queueUrl` | `string` | — | Full SQS queue URL (alternative to queueName) |
| `log` | `function` | — | Logging function |

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

## IAM permissions

The Lambda execution role needs the following SQS permissions:

```json
{
  "Effect": "Allow",
  "Action": ["sqs:SendMessage"],
  "Resource": "arn:aws:sqs:*:*:notify-queue"
}
```
