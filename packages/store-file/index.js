import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFile, writeFile, unlink } from 'node:fs/promises'

console.log('@1auth/store-file', tmpdir())

const read = async (table) =>
  readFile(join(tmpdir(), table + '.json'))
    .then((res) => JSON.parse(res))
    .catch((e) => {
      if (!e.message.includes('no such file or directory')) {
        console.error('read', e.message)
      }

      return []
    })
const write = async (table, data) =>
  writeFile(
    join(tmpdir(), table + '.json'),
    JSON.stringify(data, null, 2)
  ).catch((e) => {
    if (!e.message.includes('no such file or directory')) {
      console.error('write', e.message)
    }
  })
const erase = async (table) =>
  unlink(join(tmpdir(), table + '.json')).catch((e) => {
    if (!e.message.includes('no such file or directory')) {
      console.error('erase', e.message)
    }
  })

export const exists = async (table, filters) => {
  const item = await select(table, filters)
  return item?.sub
}

export const selectList = async (table, filters = {}) => {
  const data = await read(table)

  const filterKeys = Object.keys(filters)
  const rows = []
  for (const item of data) {
    let found = 0
    for (const key of filterKeys) {
      const [column, param] = key.split('.')
      if (
        item[column] === filters[key] ||
        item?.[column]?.[param] === filters[key]
      ) {
        found += 1
      }
    }
    if (found === filterKeys.length) {
      rows.push(item)
    }
  }
  return rows
}
// TODO add in attributes to select
export const select = async (table, filters = {}) => {
  return selectList(table, filters).then((rows) => rows?.[0])
}

export const insert = async (table, params = {}) => {
  const data = await read(table)
  data.push(params)
  await write(table, data)
  return params.id
}

export const update = async (table, filters = {}, params = {}) => {
  const data = await read(table)

  for (const [idx, item] of Object.entries(data)) {
    let found = true
    for (const key in filters) {
      if (item[key] !== filters[key]) {
        found = false
        break
      }
    }
    if (found) {
      data[idx] = { ...item, ...params }
      break // update only one
    }
  }

  await write(table, data)
}

/* export const updateList = async (table, filters = {}, params = {}) => {
  const data = await read(table)

  for (const [idx, item] of Object.entries(data)) {
    let found = true
    for (const key in filters) {
      if (item[key] !== filters[key] || filters[key].includes(item[key])) {
        found = false
        break
      }
    }
    if (found) {
      data[idx] = { ...item, ...params }
    }
  }

  await write(table, data)
} */

export const remove = async (table, filters = {}) => {
  const data = await read(table)
  const filterKeys = Object.keys(filters)

  const rows = []
  for (const item of data) {
    let found = true
    for (const key of filterKeys) {
      if (item[key] !== filters[key]) {
        found = false
        break
      }
    }
    if (!found) {
      rows.push(item)
    }
  }

  await write(table, rows)
}

// For testing only
export const __dump = async (table) => {
  return read(table)
}
export const __clear = async (table) => {
  await erase(table)
}

export default { exists, select, selectList, insert, update, remove }
