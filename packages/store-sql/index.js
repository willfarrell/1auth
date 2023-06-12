const options = {
  log: false,
  useGeneratedIdentityAsId: false, // aka SERIAL
  query: (sql, parameters) => {
    console.log('sql', sql, parameters)
    return {}
  }
}

export default (params) => {
  Object.assign(options, params)
}

export const exists = async (table, filters) => {
  const item = await select(table, filters)
  return item?.sub
}

export const selectList = async (table, filters = {}, fields = []) => {
  const { select, where, parameters } = makeSqlParts(filters, {}, fields)
  const sql = `SELECT ${select} FROM ${table} ${where}`
  return await options.query(sql, parameters)
}

export const select = async (table, filters = {}, fields = []) => {
  const { select, where, parameters } = makeSqlParts(filters, {}, fields)
  const sql = `SELECT ${select} FROM ${table} ${where} LIMIT 1`
  return await options.query(sql, parameters).then((res) => res[0])
}

export const insert = async (table, values = {}) => {
  if (options.useGeneratedIdentityAsId) {
    delete values.id
  }
  normalizeValues(values)
  const { insert, parameters } = makeSqlParts({}, values)
  const sql = `INSERT INTO ${table} ${insert}`
  return await options.query(sql, parameters)
}

export const update = async (table, filters = {}, values = {}) => {
  normalizeValues(values)
  const { update, where, parameters } = makeSqlParts(filters, values)
  const sql = `UPDATE ${table} SET ${update} ${where}`
  await options.query(sql, parameters)
}

export const remove = async (table, filters = {}) => {
  const { where, parameters } = makeSqlParts(filters)
  const sql = `DELETE FROM ${table} ${where}`
  await options.query(sql, parameters)
}

const normalizeValues = (values) => {
  values.create &&= new Date(values.create * 1000).toISOString()
  values.update &&= new Date(values.update * 1000).toISOString()
  values.verify &&= new Date(values.verify * 1000).toISOString()
  // values.lastused &&= new Date(values.lastused * 1000).toISOString()
  values.expire &&= new Date(values.expire * 1000).toISOString()
}

// export for testing
export const makeSqlParts = (filters = {}, values = {}, fields = []) => {
  let parameters = []
  let idx = 1
  const keys = Object.keys(values)

  const select = fields.length ? fields.join(', ') : '*'

  const insertParts = []
  const updateParts = []
  for (const key of keys) {
    insertParts.push('$' + idx)
    updateParts.push(key + ' = $' + idx)
    idx++
  }

  const insert =
    '("' + keys.join('", "') + '") VALUES (' + insertParts.join(', ') + ')'

  const update = updateParts.join(', ')

  parameters = parameters.concat(Object.values(values))

  let where = Object.keys(filters)
  where = where
    .map((key) => {
      if (Array.isArray(filters[key])) {
        let sql = filters[key].map((v, vidx) => '$' + idx++).join(',')
        sql = key + ' IN (' + sql + ')'
        parameters = parameters.concat(filters[key])
        return sql
      }
      const sql = key + ' = $' + idx++
      parameters.push(filters[key])
      return sql
    })
    .join(' AND ')
  where &&= `WHERE ${where}`

  return { select, insert, update, where, parameters }
}
