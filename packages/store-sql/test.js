import test from 'node:test'
import { equal, deepEqual } from 'node:assert'
// import { exists, select, selectList, insert, update, remove } from './index.js'
import { makeSqlParts } from './index.js'

// *** makeSqlParts *** //
test('makeSqlParts: Should format {select} properly', async (t) => {
  const filters = {}
  const values = {}
  const fields = ['a', 'b']

  const { select, parameters } = makeSqlParts(filters, values, fields)

  equal(select, 'a, b')
  deepEqual(parameters, [])
})

test('makeSqlParts: Should format {select} to *', async (t) => {
  const filters = {}
  const values = {}
  const fields = []

  const { select, parameters } = makeSqlParts(filters, values, fields)

  equal(select, '*')
  deepEqual(parameters, [])
})

test('makeSqlParts: Should format {insert} properly', async (t) => {
  const filters = {}
  const values = { a: 'a', b: 'b' }

  const { insert, parameters } = makeSqlParts(filters, values)

  equal(insert, '(a, b) VALUES ($1, $2)')
  deepEqual(parameters, ['a', 'b'])
})

test('makeSqlParts: Should format {update} properly', async (t) => {
  const filters = {}
  const values = { a: 'a', b: 'b' }

  const { update, parameters } = makeSqlParts(filters, values)

  equal(update, 'a = $1, b = $2')
  deepEqual(parameters, ['a', 'b'])
})

test('makeSqlParts: Should format {where} properly', async (t) => {
  const filters = { a: 'a', bc: ['b', 'c'], d: 'd' }

  const { where, parameters } = makeSqlParts(filters)

  equal(where, 'a = $1 AND bc IN ($2,$3) AND d = $4')
  deepEqual(parameters, ['a', 'b', 'c', 'd'])
})
