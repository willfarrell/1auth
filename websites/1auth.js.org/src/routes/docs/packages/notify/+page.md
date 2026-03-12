---
title: "@1auth/notify"
description: Base notification interface for sending events through configured channels.
---

Base notification interface for sending events through configured channels.

## Install

```bash
npm i @1auth/notify
```

## Usage

```javascript
import * as notify from '@1auth/notify'

notify.default({
  client: (message) => { /* handle notification */ }
})
```

## API

### `trigger(id, sub, data, notifyOptions)`

Emit a notification event.

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | `string` | Template identifier (e.g., `email-verify`) |
| `sub` | `string` | Subject/user ID |
| `data` | `object` | Template variables |
| `notifyOptions` | `object` | Delivery options |

The `notifyOptions` object can include:

- `messengers` — Array of `{id}` or `{type, value}` targets
- `types` — Array of messenger types to target

The notification service is responsible for rendering templates and delivering messages through the appropriate channel.
