import { test, describe, it } from 'node:test'
import { ok, equal, deepEqual } from 'node:assert/strict'

import * as notify from '../notify-console/index.js'
import * as storeMemory from '../store-memory/index.js'
import * as storeSQL from '../store-sql/index.js'
import * as storeDynamoDB from '../store-dynamodb/index.js'

import * as mockStoreSQL from '../store-sql/mock.sqlite.js'
import * as mockStoreDynamoDB from '../store-dynamodb/mock.dynamodb.js'

import sessionMemoryTable from './table/memory.js'
import sessionSQLTable from './table/sql.js'
import sessionDynamoDBTable from './table/dynamodb.js'

import crypto, {
  symmetricRandomEncryptionKey,
  symmetricRandomSignatureSecret
} from '../crypto/index.js'

import account, {
  create as accountCreate,
  remove as accountRemove,
  getOptions as accountGetOptions
} from '../account/index.js'

import accountUsername, {
  create as accountUsernameCreate,
  exists as accountUsernameExists
} from '../account-username/index.js'

import authn, { getOptions as authnGetOptions } from '../authn/index.js'
import recoveryCodes from '../authn-recovery-codes/index.js'

import session, {
  getOptions as sessionGetOptions,
  create as sessionCreate,
  check as sessionCheck,
  lookup as sessionLookup,
  list as sessionList,
  expire as sessionExpire
  // remove as sessionRemove,
} from '../session/index.js'

const mocks = {
  notifyClient: () => {}
}

crypto({
  symmetricEncryptionKey: symmetricRandomEncryptionKey(),
  symmetricSignatureSecret: symmetricRandomSignatureSecret()
})
notify.default({
  client: (id, sub, params) => {
    mocks.notifyClient(id, sub, params)
  }
})

storeMemory.default({
  log: false // console.log,
})
storeSQL.default({
  log: false, // mockStoreSQL.log,
  query: mockStoreSQL.query
})
storeDynamoDB.default({
  log: false, // mockStoreDynamoDB.log,
  client: mockStoreDynamoDB.client
})

const stores = {
  memeory: { store: storeMemory, table: sessionMemoryTable },
  sql: { store: storeSQL, table: sessionSQLTable },
  dynamodb: { store: storeDynamoDB, table: sessionDynamoDBTable }
}

let sub
const username = 'username'

account({
  store: storeMemory,
  notify,
  encryptedFields: ['name', 'username', 'privateKey']
})
accountUsername()

authn({
  store: storeMemory,
  notify,
  usernameExists: [accountUsernameExists],
  encryptedFields: ['value', 'name']
})
recoveryCodes()

describe('session', () => {
  for (const storeKey of Object.keys(stores)) {
    describe(`using store-${storeKey}`, () => {
      let store, table
      test.beforeEach(async (t) => {
        const config = stores[storeKey]
        store = config.store
        table = config.table
        session({ store, notify })

        await store.__table(table(sessionGetOptions().table))
        sub = await accountCreate()
        await accountUsernameCreate(sub, username)
        t.mock.method(mocks, 'notifyClient')
      })

      test.afterEach(async (t) => {
        t.mock.reset()
        await accountRemove(sub)
        await store.__clear(sessionGetOptions().table)
        await storeMemory.__clear(authnGetOptions().table)
        await storeMemory.__clear(accountGetOptions().table)
      })

      it('Can create session on an account', async () => {
        const currentDevice = { os: 'MacOS' }

        await sessionCheck(sub, currentDevice)
        await sessionCreate(sub, currentDevice)
        // notify
        equal(mocks.notifyClient.mock.calls.length, 1)
        deepEqual(mocks.notifyClient.mock.calls[0].arguments[0], {
          id: 'authn-session-new-device',
          sub,
          data: undefined,
          options: {}
        })
      })
      it('Can create session on an account from same device', async () => {
        const currentDevice = { os: 'MacOS' }
        const pastDevice = { os: 'MacOS' }
        await sessionCreate(sub, pastDevice)

        await sessionCheck(sub, currentDevice)
        await sessionCreate(sub, currentDevice)
        // notify
        equal(mocks.notifyClient.mock.calls.length, 0)
      })
      it('Can create session on an account from a new device', async () => {
        const currentDevice = { os: 'MacOS' }
        const pastDevice = { os: 'Windows' }
        await sessionCreate(sub, pastDevice)

        await sessionCheck(sub, currentDevice)
        await sessionCreate(sub, currentDevice)

        // notify
        equal(mocks.notifyClient.mock.calls.length, 1)
        deepEqual(mocks.notifyClient.mock.calls[0].arguments[0], {
          id: 'authn-session-new-device',
          sub,
          data: undefined,
          options: {}
        })
      })
      it('Can list sessions for an account', async () => {
        const currentDevice = { os: 'MacOS' }
        const otherDevice = { os: 'iOS' }
        await sessionCreate(sub, currentDevice)
        const { id } = await sessionCreate(sub, otherDevice)
        await sessionExpire(sub, id)

        const sessions = await sessionList(sub)
        equal(sessions.length, 1)
      })

      it('Can lookup a session by { id }', async () => {
        const currentDevice = { os: 'MacOS' }
        const { id } = await sessionCreate(sub, currentDevice)
        const session = await sessionLookup(id, currentDevice)
        ok(session)
        equal(session.id, id)
      })

      it('Can NOT lookup a session by { id } when expired', async () => {
        const currentDevice = { os: 'MacOS' }
        const { id } = await sessionCreate(sub, currentDevice)
        await sessionExpire(sub, id)
        const session = await sessionLookup(id, currentDevice)
        equal(session, undefined)
      })

      it('Can NOT lookup a session by { id } when different device', async () => {
        const currentDevice = { os: 'MacOS' }
        const attackerDevice = { os: 'Windows' }
        const { id } = await sessionCreate(sub, currentDevice)
        await sessionExpire(sub, id)
        const session = await sessionLookup(id, attackerDevice)
        equal(session, undefined)
      })

      it('Can list sessions for an account, excluding expired', async () => {
        const currentDevice = { os: 'MacOS' }
        const otherDevice = { os: 'iOS' }
        await sessionCreate(sub, currentDevice)
        const { id } = await sessionCreate(sub, otherDevice)
        await sessionExpire(sub, id)

        const sessions = await sessionList(sub)
        equal(sessions.length, 1)
      })
    })
  }
})
