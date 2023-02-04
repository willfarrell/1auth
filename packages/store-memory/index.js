const db = {}

export const exists = async (table, filters) => {
  const item = await select(table, filters)
  return item?.sub
}

export const selectList = async (table, filters = {}) => {
  const data = db[table] ?? []

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
export const select = async (table, filters = {}) => {
  return selectList(table, filters).then((res) => res?.[0])
}

export const insert = async (table, params = {}) => {
  const data = db[table] ?? []
  data.push(params)
  return params.id
}

export const update = async (table, filters = {}, params = {}) => {
  for (const [idx, item] of Object.entries(db[table])) {
    let found = true
    for (const key in filters) {
      if (item[key] !== filters[key]) {
        found = false
        break
      }
    }
    if (found) {
      db[idx] = { ...item, ...params }
    }
  }
}

export const remove = async (table, filters = {}) => {
  const filterKeys = Object.keys(filters)

  const rows = []
  for (const item of db[table]) {
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
    if (found !== filterKeys.length) {
      rows.push(item)
    }
  }

  db[table] = rows
}

// For testing only
export const __dump = async (table) => {
  return db[table]
}
export const __clear = async (table) => {
  delete db[table]
}

export default { exists, select, selectList, insert, update, remove }
