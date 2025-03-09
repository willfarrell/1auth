import { test, describe, it } from 'node:test'
import { ok, equal, deepEqual } from 'node:assert/strict'

import * as notify from '../notify-console/index.js'
import * as store from '../store-memory/index.js'
import crypto, {
  symmetricRandomEncryptionKey,
  symmetricRandomSignatureSecret,
  randomChecksumSalt,
  randomChecksumPepper
} from '../crypto/index.js'

import authn, { getOptions as authnGetOptions } from '../authn/index.js'

import messenger, {
  exists as messengerExists,
  lookup as messengerLookup,
  list as messengerList,
  create as messengerCreate,
  verifyToken as messengerVerifyToken,
  remove as messengerRemove,
  getOptions as messengerGetOptions
} from '../messenger/index.js'

crypto({
  symmetricEncryptionKey: symmetricRandomEncryptionKey(),
  symmetricSignatureSecret: symmetricRandomSignatureSecret(),
  digestChecksumSalt: randomChecksumSalt(),
  digestChecksumPepper: randomChecksumPepper()
})
store.default({ log: false })
notify.default({
  client: (id, sub, params) => {
    mocks.notifyClient(id, sub, params)
  }
})

authn({ store, notify })
messenger({ store, notify })

const mocks = {
  notifyClient: () => {}
}
const sub = 'sub_000000'
test.beforeEach(async (t) => {
  t.mock.method(mocks, 'notifyClient')
})

test.afterEach(async (t) => {
  t.mock.reset()
  await store.__clear(messengerGetOptions().table)
})

describe('messenger', () => {
  it('Can create a messenger on an account', async () => {
    const messengerType = 'signal'
    const messengerId = await messengerCreate(
      messengerType,
      sub,
      '@username.00'
    )
    const { token, expire } =
      mocks.notifyClient.mock.calls[0].arguments[0].data

    // notify
    deepEqual(mocks.notifyClient.mock.calls[0].arguments[0], {
      id: 'messenger-signal-verify',
      sub,
      data: { token, expire },
      options: {
        messengers: [{ id: messengerId }]
      }
    })

    let messengerDB = await store.select(messengerGetOptions().table, { sub })
    let authnDB = await store.select(authnGetOptions().table, { sub })

    equal(messengerDB.id, messengerId)
    equal(messengerDB.type, messengerType)
    ok(messengerDB.value)
    ok(messengerDB.digest)
    ok(!messengerDB.verify)

    await messengerVerifyToken(messengerType, sub, token, messengerId)

    // notify
    equal(mocks.notifyClient.mock.calls.length, 1)

    messengerDB = await store.select(messengerGetOptions().table, { sub })
    authnDB = await store.select(authnGetOptions().table, { sub })
    ok(messengerDB.verify)
    ok(!authnDB)
  })

  it('Can delete a verified messenger on an account', async () => {
    const messengerType = 'signal'
    const messengerId = await messengerCreate(
      messengerType,
      sub,
      '@username.00'
    )
    const { token } = mocks.notifyClient.mock.calls[0].arguments[0].data
    await messengerVerifyToken(messengerType, sub, token, messengerId)
    await messengerRemove(messengerType, sub, messengerId)

    // notify
    deepEqual(mocks.notifyClient.mock.calls[1].arguments[0], {
      id: 'messenger-signal-remove-self',
      sub,
      data: undefined,
      options: {
        messengers: [
          {
            type: 'signal',
            value: '@username.00'
          }
        ]
      }
    })
    deepEqual(mocks.notifyClient.mock.calls[2].arguments[0], {
      id: 'messenger-signal-remove',
      sub,
      data: undefined,
      options: {}
    })

    const messengerDB = await store.select(messengerGetOptions().table, {
      sub
    })

    ok(!messengerDB)
  })
  it('Can delete an unverified messenger on an account', async () => {
    const messengerType = 'signal'
    const messengerId = await messengerCreate(
      messengerType,
      sub,
      '@username.00'
    )
    await messengerRemove(messengerType, sub, messengerId)

    // notify
    equal(mocks.notifyClient.mock.calls.length, 1)

    const messengerDB = await store.select(messengerGetOptions().table, {
      sub
    })

    ok(!messengerDB)
  })
  it('Can NOT delete a messenger of someone elses account', async () => {
    const messengerType = 'signal'
    const messengerId = await messengerCreate(
      messengerType,
      sub,
      '@username.00'
    )
    try {
      await messengerRemove(messengerType, 'sub_111111', messengerId)
    } catch (e) {
      equal(e.message, '403 Unauthorized')
    }
  })

  it('Can check is a messenger exists (exists)', async () => {
    const messengerType = 'signal'
    const messengerValue = '@username.00'
    const messengerId = await messengerCreate(
      messengerType,
      sub,
      messengerValue
    )
    const { token } = mocks.notifyClient.mock.calls[0].arguments[0].data
    await messengerVerifyToken(messengerType, sub, token, messengerId)
    const user = await messengerExists(messengerType, messengerValue)
    ok(user)
  })
  it('Can check is a messenger exists (not exists)', async () => {
    const messengerType = 'signal'
    const user = await messengerExists(messengerType, 'notfound')
    equal(user, undefined)
  })

  it('Can lookup a messenger { value } (exists)', async () => {
    const messengerType = 'signal'
    const messengerValue = '@username.00'
    const messengerId = await messengerCreate(
      messengerType,
      sub,
      messengerValue
    )
    const { token } = mocks.notifyClient.mock.calls[0].arguments[0].data
    await messengerVerifyToken(messengerType, sub, token, messengerId)
    const messenger = await messengerLookup(messengerType, messengerValue)

    equal(messenger.value, messengerValue) // unencrypted
  })
  it('Can lookup a messenger (unverified) { value } (exists)', async () => {
    const messengerType = 'signal'
    const messengerValue = '@username.00'
    await messengerCreate(messengerType, sub, messengerValue)
    const messenger = await messengerLookup(messengerType, messengerValue)
    equal(messenger, undefined)
  })
  it('Can lookup a messenger { value } (not exists)', async () => {
    const messengerType = 'signal'
    const messengerValue = '@username.00'
    const messenger = await messengerLookup(messengerType, messengerValue)
    equal(messenger, undefined)
  })
  it('Can list messengers with { sub }', async () => {
    const messengerType = 'signal'
    const messengerValue = '@username.00'
    await messengerCreate(messengerType, sub, messengerValue)
    const messengers = await messengerList(messengerType, sub)

    equal(messengers[0].value, messengerValue) // unencrypted
  })
})
