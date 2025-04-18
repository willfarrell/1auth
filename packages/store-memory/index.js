import { randomBytes } from "node:crypto";

const db = Object.create(null);

const options = {
  id: "",
  log: false,
  // number of seconds after expire before removal
  // 10d chosen based on EFF DNT Policy
  timeToLiveExpireOffset: 10 * 24 * 60 * 60,
  timeToLiveKey: "remove",
};

export default (params) => {
  Object.assign(options, params);
};

export const exists = async (table, filters) => {
  if (options.log) {
    options.log("@1auth/store-memeory exists(", table, filters, ")");
  }
  const data = db[table] ?? [];

  for (const item of data) {
    if (matchFilter(item, filters)) {
      return item.sub;
    }
  }
};

export const count = async (table, filters) => {
  if (options.log) {
    options.log("@1auth/store-memeory count(", table, filters, ")");
  }
  const data = db[table] ?? [];
  let count = 0;
  for (const item of data) {
    if (matchFilter(item, filters)) {
      count += 1;
    }
  }
  return count;
};

export const select = async (table, filters = {}) => {
  if (options.log) {
    options.log("@1auth/store-memeory select(", table, filters, ")");
  }
  const data = db[table] ?? [];

  for (const item of data) {
    if (matchFilter(item, filters)) {
      return structuredClone(item);
    }
  }
};

export const selectList = async (table, filters = {}) => {
  if (options.log) {
    options.log("@1auth/store-memeory selectList(", table, filters, ")");
  }

  const data = db[table] ?? [];

  const rows = [];
  for (const item of data) {
    if (matchFilter(item, filters)) {
      rows.push(item);
    }
  }
  return structuredClone(rows);
};

export const insert = async (table, values = {}) => {
  if (options.log) {
    options.log("@1auth/store-memeory insert(", table, values, ")");
  }
  db[table] ??= [];
  if (values.expire && options.timeToLiveKey) {
    values[options.timeToLiveKey] =
      values.expire + options.timeToLiveExpireOffset;
  }
  values = structuredClone(values);
  values.id ??= __randomId();
  db[table].push(values);
  return values.id;
};

export const insertList = async (table, list = []) => {
  if (options.log) {
    options.log("@1auth/store-memeory insert(", table, list, ")");
  }
  db[table] ??= [];
  const ids = [];
  for (const values of list) {
    values.id ??= __randomId();
    db[table].push(values);
    ids.push(values.id);
  }
  return ids;
};

export const update = async (table, filters = {}, values = {}) => {
  if (options.log) {
    options.log("@1auth/store-memeory update(", table, filters, values, ")");
  }
  for (const [idx, item] of Object.entries(db[table])) {
    if (matchFilter(item, filters)) {
      db[table][idx] = { ...item, ...structuredClone(values) };
    }
  }
};

export const remove = async (table, filters = {}) => {
  if (options.log) {
    options.log("@1auth/store-memeory remove(", table, filters, ")");
  }
  const rows = [];
  for (const item of db[table] ?? []) {
    if (!matchFilter(item, filters)) {
      rows.push(item);
    }
  }

  db[table] = rows;
};

const matchFilter = (item, filters) => {
  const filterKeys = Object.keys(filters);
  let found = true;
  for (const key of filterKeys) {
    if (Array.isArray(filters[key])) {
      if (!filters[key].includes(item[key])) {
        found = false;
        break;
      }
    } else if (item[key] !== filters[key]) {
      found = false;
      break;
    }
  }
  return found;
};

const __randomId = () => {
  return randomBytes(32).toString("base64");
};
// For testing only
export const __table = async (table) => {
  if (options.log) {
    options.log("__table", { table });
  }
  db[table] ??= [];
};

export const __clear = async (table) => {
  if (options.log) {
    options.log("__clear", { table });
  }
  delete db[table];
};
