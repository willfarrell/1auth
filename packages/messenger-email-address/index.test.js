import { test, describe, it } from 'node:test'
import { ok, equal, deepEqual } from 'node:assert/strict'

import * as notify from '../notify-console/index.js'
import * as store from '../store-memory/index.js'
import crypto, { randomSymetricEncryptionKey } from '../crypto/index.js'

import authn, { getOptions as authnGetOptions } from '../authn/index.js'

import messenger, {
  getOptions as messengerGetOptions
} from '../messenger/index.js'
import emailAddress, {
  exists as emailAddressExists,
  lookup as emailAddressLookup,
  list as emailAddressList,
  create as emailAddressCreate,
  verifyToken as emailAddressrVerifyToken,
  remove as emailAddressrRemove
} from '../messenger-email-address/index.js'

crypto({ symetricEncryptionKey: randomSymetricEncryptionKey() })
store.default({ log: false })
notify.default({
  client: (id, sub, params) => {
    mocks.notifyClient(id, sub, params)
  }
})

authn({ store, notify })
messenger({ store, notify })
emailAddress()

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
    const messengerId = await emailAddressCreate(sub, 'username@example.org')
    const { token, expire } =
      mocks.notifyClient.mock.calls[0].arguments[0].params

    // notify
    deepEqual(mocks.notifyClient.mock.calls[0].arguments[0], {
      id: 'messenger-emailAddress-verify',
      sub,
      params: { token, expire }
    })

    let messengerDB = await store.select(messengerGetOptions().table, { sub })
    let authnDB = await store.select(authnGetOptions().table, { sub })

    equal(messengerDB.id, messengerId)
    equal(messengerDB.type, 'emailAddress')
    ok(messengerDB.value)
    ok(messengerDB.digest)
    ok(!messengerDB.verify)

    await emailAddressrVerifyToken(sub, token)

    // notify
    deepEqual(mocks.notifyClient.mock.calls[1].arguments[0], {
      id: 'messenger-emailAddress-create',
      sub,
      params: undefined
    })

    messengerDB = await store.select(messengerGetOptions().table, { sub })
    authnDB = await store.select(authnGetOptions().table, { sub })
    ok(messengerDB.verify)
    ok(!authnDB)
  })

  it('Can remove a verified messenger on an account', async () => {
    const messengerId = await emailAddressCreate(sub, 'username@example.org')
    const { token } = mocks.notifyClient.mock.calls[0].arguments[0].params
    await emailAddressrVerifyToken(sub, token)
    await emailAddressrRemove(sub, messengerId)

    // notify
    deepEqual(mocks.notifyClient.mock.calls[2].arguments[0], {
      id: 'messenger-emailAddress-remove',
      sub,
      params: undefined
    })

    const messengerDB = await store.select(messengerGetOptions().table, {
      sub
    })

    ok(!messengerDB)
  })
  it('Can remove an unverified messenger on an account', async () => {
    const messengerId = await emailAddressCreate(sub, 'username@example.org')
    await emailAddressrRemove(sub, messengerId)

    // notify
    equal(mocks.notifyClient.mock.calls.length, 1)

    const messengerDB = await store.select(messengerGetOptions().table, {
      sub
    })

    ok(!messengerDB)
  })
  it('Can NOT remove a messenger of someone elses account', async () => {
    const messengerId = await emailAddressCreate(sub, 'username@example.org')
    try {
      await emailAddressrRemove('sub_111111', messengerId)
    } catch (e) {
      equal(e.message, '403 Unauthorized')
    }
  })

  it('Can check is a messenger exists (exists)', async () => {
    const messengerValue = 'username@example.org'
    await emailAddressCreate(sub, messengerValue)
    const { token } = mocks.notifyClient.mock.calls[0].arguments[0].params
    await emailAddressrVerifyToken(sub, token)
    const user = await emailAddressExists(messengerValue)
    ok(user)
  })
  it('Can check is a messenger exists (not exists)', async () => {
    const user = await emailAddressExists('notfound')
    equal(user, undefined)
  })

  it('Can lookup a messenger { value } (exists)', async () => {
    const messengerValue = 'username@example.org'
    await emailAddressCreate(sub, messengerValue)
    const { token } = mocks.notifyClient.mock.calls[0].arguments[0].params
    await emailAddressrVerifyToken(sub, token)
    const messenger = await emailAddressLookup(messengerValue)

    ok(messenger)
    equal(messenger.value, messengerValue) // unencrypted
  })
  it('Can lookup a messenger (unverified) { value } (exists)', async () => {
    const messengerValue = 'username@example.org'
    await emailAddressCreate(sub, messengerValue)
    const messenger = await emailAddressLookup(messengerValue)
    equal(messenger, undefined)
  })
  it('Can lookup a messenger { value } (not exists)', async () => {
    const messengerValue = 'username@example.org'
    const messenger = await emailAddressLookup(messengerValue)
    equal(messenger, undefined)
  })
  it('Can list messengers with { sub }', async () => {
    const messengerValue = 'username@example.org'
    await emailAddressCreate(sub, messengerValue)
    const messenger = await emailAddressList(sub)
    ok(messenger)
    equal(messenger[0].value, messengerValue) // unencrypted
  })

  // TODO sanitize, validate testings
})
