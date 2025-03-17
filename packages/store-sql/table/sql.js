export const sqlTable = (table = "test") => {
  return `
  CREATE TABLE IF NOT EXISTS ${table}
  (
    id INTEGER,
    sub VARCAHR(32),
    value TEXT
  )
  `;
};
