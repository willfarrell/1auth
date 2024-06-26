import Database from 'better-sqlite3'
const db = new Database('test.db', { verbose: () => {} })
db.pragma('journal_mode = WAL')

// const defaults = {
//   log: true,
// };
// const options = {};
// export default (opt = {}) => {
//   Object.assign(options, defaults, opt);
// };
export const log = console.log
export const query = async (sql, parameters) => {
  // console.log(sql, parameters);
  try {
    if (sql.substring(0, 6) === 'SELECT') {
      return db.prepare(sql).all(...(parameters ?? []))
    } else if (sql.substring(0, 6) === 'DELETE') {
      return db.prepare(sql).run(...(parameters ?? []))
    }
    return db.prepare(sql).get(...(parameters ?? []))
  } catch (e) {
    if (e.message.includes('Use run() instead')) {
      return db.prepare(sql).run(...(parameters ?? []))
    }
    console.error(e, { cause: { sql, parameters } })
  }
}
