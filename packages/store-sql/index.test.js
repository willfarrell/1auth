import { test, describe, it } from 'node:test'
import { equal, deepEqual } from 'node:assert/strict'

import * as store from '../store-sql/index.js'

import { sqlTable } from './table/sql.js'
import { query as sqliteQuery } from './mock.sqlite.js'
// import Database from "better-sqlite3";
// const db = new Database("test.db", { verbose: () => {} });
// db.pragma("journal_mode = WAL");

const table = 'test'
sqliteQuery(sqlTable(table))

store.default({
  log: (...args) => mocks.log(...args),
  query: (...args) => mocks.query(...args)
})

const mocks = {
  log: () => {}, // console.log,
  query: sqliteQuery
}

test.beforeEach(async (t) => {
  t.mock.method(mocks, 'log')
  t.mock.method(mocks, 'query')
})

test.afterEach(async (t) => {
  t.mock.reset()
  await store.__clear(table)
})

describe('store-sql', () => {
  it('`exists` Should return undefined when nothing found', async () => {
    const result = await store.exists(table, { id: 1 })
    equal(result, undefined)
    equal(mocks.log.mock.calls.length, 1)
  })
  it('`exists` Should return sub when something found', async () => {
    const row = { id: 1, sub: 'sub_000', value: 'a' }
    await store.insert(table, row)
    const result = await store.exists(table, { id: row.id })
    equal(result, row.sub)
    equal(mocks.log.mock.calls.length, 2)
  })
  it('`count` Should return 0 when nothing found', async () => {
    const result = await store.count(table, { id: 1 })
    equal(result, 0)
    equal(mocks.log.mock.calls.length, 1)
  })
  it('`count` Should return # when something found', async () => {
    const row = { id: 1, sub: 'sub_000', value: 'a' }
    await store.insert(table, row)
    const result = await store.count(table, { id: row.id })
    equal(result, 1)
    equal(mocks.log.mock.calls.length, 2)
  })
  it('`select` Should return undefined when nothing found', async () => {
    const result = await store.select(table, { id: 1 })
    equal(result, undefined)
    equal(mocks.log.mock.calls.length, 1)
  })
  it('`insert`/`update`/`select` Should return object when something found', async () => {
    const row = { id: 1, sub: 'sub_000', value: 'a' }
    await store.insert(table, row)
    let result = await store.select(table, { id: row.id })
    row.value = 'b'
    await store.update(
      table,
      { sub: 'sub_000', id: row.id },
      { value: row.value }
    )
    result = await store.select(table, { id: row.id })
    deepEqual(result, row)
    equal(mocks.log.mock.calls.length, 4)
  })
  it('`selectList` Should return [] when nothing found', async () => {
    const result = await store.selectList(table, { id: 1 })
    deepEqual(result, [])
    equal(mocks.log.mock.calls.length, 1)
  })
  it('`insertList`/`selectList` Should return object[] when something found', async () => {
    const rows = [
      { id: 1, sub: 'sub_000', value: 'a' },
      { id: 2, sub: 'sub_000', value: 'b' }
    ]
    await store.insertList(table, rows)
    let result = await store.selectList(table, { id: rows[0].id })
    deepEqual(result, [rows[0]])
    equal(mocks.log.mock.calls.length, 2)

    result = await store.selectList(table, { sub: rows[0].sub })
    deepEqual(result, rows)
    equal(mocks.log.mock.calls.length, 3)
  })
  it("`remove` Should remove row in store using {id:''}", async () => {
    const rows = [
      { id: 1, sub: 'sub_000', value: 'a' },
      { id: 2, sub: 'sub_000', value: 'b' }
    ]
    await store.insertList(table, rows)
    await store.remove(table, { sub: 'sub_000', id: rows[0].id })
    const result = await store.selectList(table, { sub: rows[0].sub })
    deepEqual(result, [rows[1]])
    equal(mocks.log.mock.calls.length, 3)
  })
  it("`remove` Should remove row in store using {id:'', sub:''}", async () => {
    const rows = [
      { id: 1, sub: 'sub_000', value: 'a' },
      { id: 2, sub: 'sub_000', value: 'b' }
    ]
    await store.insertList(table, rows)
    await store.remove(table, { sub: rows[0].sub, id: rows[0].id })
    const result = await store.selectList(table, { sub: rows[0].sub })
    deepEqual(result, [rows[1]])
    equal(mocks.log.mock.calls.length, 3)
  })
  it('`remove` Should remove rows in store using {id:[]}', async () => {
    const rows = [
      { id: 1, sub: 'sub_000', value: 'a' },
      { id: 2, sub: 'sub_000', value: 'b' },
      { id: 3, sub: 'sub_000', value: 'c' }
    ]
    await store.insertList(table, rows)
    await store.remove(table, { sub: 'sub_000', id: [rows[0].id, rows[1].id] })
    const result = await store.selectList(table, { sub: rows[0].sub })
    deepEqual(result, [rows[2]])
    equal(mocks.log.mock.calls.length, 3)
  })

  describe('makeSqlParts', () => {
    it('Should format {select} properly', async (t) => {
      const filters = {}
      const values = {}
      const fields = ['a', 'b']

      const { select, parameters } = store.makeSqlParts(
        filters,
        values,
        fields
      )

      equal(select, '"a", "b"')
      deepEqual(parameters, [])
    })

    it('Should format {select} to *', async (t) => {
      const filters = {}
      const values = {}
      const fields = []

      const { select, parameters } = store.makeSqlParts(
        filters,
        values,
        fields
      )

      equal(select, '*')
      deepEqual(parameters, [])
    })

    it('Should format {insert} properly', async (t) => {
      const filters = {}
      const values = { a: 'a', b: 'b' }

      const { insert, parameters } = store.makeSqlParts(filters, values)

      equal(insert, '("a", "b") VALUES (?, ?)')
      deepEqual(parameters, ['a', 'b'])
    })

    it('Should format {update} properly', async (t) => {
      const filters = {}
      const values = { a: 'a', b: 'b' }

      const { update, parameters } = store.makeSqlParts(filters, values)

      equal(update, '"a" = ?, "b" = ?')
      deepEqual(parameters, ['a', 'b'])
    })

    it('Should format {where} properly', async (t) => {
      const filters = { a: 'a', bc: ['b', 'c'], d: 'd' }

      const { where, parameters } = store.makeSqlParts(filters)

      equal(where, 'WHERE "a" = ? AND "bc" IN (?,?) AND "d" = ?')
      deepEqual(parameters, ['a', 'b', 'c', 'd'])
    })
  })
})
