// Copyright 2003 - 2026 will Farrell, and 1Auth contributors.
// SPDX-License-Identifier: MIT
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(":memory:", {});
db.exec("PRAGMA journal_mode = 'wal';");

// Wrap node:sqlite DatabaseSync with D1-compatible async API
const createBoundStatement = (sql, params) => ({
	all() {
		const results = db.prepare(sql).all(...params);
		return Promise.resolve({ results });
	},
	first() {
		const row = db.prepare(sql).get(...params);
		return Promise.resolve(row ?? null);
	},
	run() {
		try {
			const result = db.prepare(sql).run(...params);
			return Promise.resolve({
				meta: { last_row_id: result.lastInsertRowid },
			});
		} catch (e) {
			if (e.message.includes("Use run() instead")) {
				db.prepare(sql).run(...params);
				return Promise.resolve({ meta: { last_row_id: 0 } });
			}
			throw e;
		}
	},
});

export const log = () => {};
export const storeClient = {
	prepare(sql) {
		return {
			bind(...params) {
				return createBoundStatement(sql, params);
			},
			// No-bind shorthand (for table DDL)
			all() {
				return createBoundStatement(sql, []).all();
			},
			first() {
				return createBoundStatement(sql, []).first();
			},
			run() {
				return createBoundStatement(sql, []).run();
			},
		};
	},
	batch(stmts) {
		return Promise.resolve(stmts.map((stmt) => stmt.run()));
	},
	after: () => db.close(),
};
