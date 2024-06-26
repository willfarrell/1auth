import { test, describe, it } from 'node:test'
import { ok, equal, notEqual, deepEqual } from 'node:assert/strict'

import * as notify from '../notify-console/index.js'
import * as store from '../store-memory/index.js'
import crypto, { randomSymetricEncryptionKey } from '../crypto/index.js'

import account, {
  create as accountCreate,
  remove as accountRemove,
  getOptions as accountGetOptions
} from '../account/index.js'

import accountUsername, {
  create as accountUsernameCreate,
  exists as accountUsernameExists,
  lookup as accountUsernameLookup,
  update as accountUsernameUpdate,
  recover as accountUsernameRecover
} from '../account-username/index.js'

crypto({
  symetricEncryptionKey: randomSymetricEncryptionKey()
})
store.default({ log: false })
notify.default({
  client: (id, sub, params) => {
    mocks.notifyClient(id, sub, params)
  }
})
account({ store, notify, encryptedFields: ['name', 'username', 'privateKey'] })
accountUsername({
  usernameBlacklist: ['admin']
})

const mocks = {
  notifyClient: () => {}
}
let sub
test.beforeEach(async (t) => {
  sub = await accountCreate()
  t.mock.method(mocks, 'notifyClient')
})

test.afterEach(async (t) => {
  t.mock.reset()
  await accountRemove(sub)
  await store.__clear(accountGetOptions().table)
})

describe('account-username', () => {
  it('Can create a username on an account', async () => {
    const usernameValue = 'username'
    await accountUsernameCreate(sub, usernameValue)
    const db = await store.select(accountGetOptions().table, { sub })
    ok(db.username)
    notEqual(db.username, usernameValue) // encrypted
  })
  it('Can check is a username exists (exists)', async () => {
    const usernameValue = 'username'
    await accountUsernameCreate(sub, usernameValue)
    const user = await accountUsernameExists(usernameValue)
    ok(user)
  })
  it('Can check is a username exists (not exists)', async () => {
    const user = await accountUsernameExists('notfound')
    equal(user, undefined)
  })
  it('Can lookup an account { username } (exists)', async () => {
    const usernameValue = 'username'
    await accountUsernameCreate(sub, usernameValue)
    const user = await accountUsernameLookup(usernameValue)
    ok(user)
    equal(user.username, usernameValue) // unencrypted
  })
  it('Can lookup an account { username } (not exists)', async () => {
    const usernameValue = 'username'
    const user = await accountUsernameLookup(usernameValue)
    equal(user, undefined)
  })
  it('Can update username', async () => {
    const usernameValue = 'username'
    await accountUsernameCreate(sub, usernameValue)
    const newUsernameValue = 'nameuser'
    await accountUsernameUpdate(sub, newUsernameValue)

    let user = await accountUsernameLookup(usernameValue)
    equal(user, undefined)

    user = await accountUsernameLookup(newUsernameValue)
    ok(user)

    // notify
    deepEqual(mocks.notifyClient.mock.calls[0].arguments[0], {
      id: 'account-username-change',
      sub,
      params: undefined
    })
  })
  it('Can recover a useranme using { sub }', async () => {
    // You would lookup sub using an email first
    const usernameValue = 'username'
    await accountUsernameCreate(sub, usernameValue)
    await accountUsernameRecover(sub)

    // notify
    deepEqual(mocks.notifyClient.mock.calls[0].arguments[0], {
      id: 'account-username-recover',
      sub,
      params: { username: usernameValue }
    })
  })

  it('Should allow username with upper case, and accentent char', async () => {
    const usernameValue = 'USERnaméﬁ'
    await accountUsernameCreate(sub, usernameValue)
    const user = await accountUsernameExists(usernameValue)
    ok(user)
  })
  it('Should throw when username is too short', async () => {
    const usernameValue = ''
    try {
      await accountUsernameCreate(sub, usernameValue)
    } catch (e) {
      equal(e.message, '400 invalid username')
    }
  })
  it('Should throw when username is too long', async () => {
    const usernameValue = '000000000111111111122222222223333'
    try {
      await accountUsernameCreate(sub, usernameValue)
    } catch (e) {
      equal(e.message, '400 invalid username')
    }
  })
  it('Should throw when username contains invalid chars', async () => {
    const usernameValue = 'username*'
    try {
      await accountUsernameCreate(sub, usernameValue)
    } catch (e) {
      equal(e.message, '400 invalid username')
    }
  })
  it('Should throw when username contains a black liisted word', async () => {
    const usernameValue = 'user_admin_name'
    try {
      await accountUsernameCreate(sub, usernameValue)
    } catch (e) {
      equal(e.message, '409 invalid username')
    }
  })
  it('Should throw when username already exists', async () => {
    const usernameValue = 'username'
    await accountUsernameCreate(sub, usernameValue)
    sub = await accountCreate()
    try {
      await accountUsernameCreate(sub, usernameValue)
    } catch (e) {
      equal(e.message, '409 Conflict')
    }
  })
})
