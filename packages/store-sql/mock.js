// Copyright 2003 - 2026 will Farrell, and 1Auth contributors.
// SPDX-License-Identifier: MIT
import { DatabaseSync } from "node:sqlite";
import { setTimeout } from "node:timers/promises";

const db = new DatabaseSync(":memory:", {});
db.exec("PRAGMA journal_mode = 'wal';");

export const log = () => {};
export const storeClient = {
	// The store's contract: always rows[], for every statement
	query: async (sql, parameters) => {
		try {
			return db.prepare(sql).all(...(parameters ?? []));
		} catch (e) {
			// Statements that return no rows (UPDATE, DDL) can't be `all`ed
			if (e.message.includes("Use run() instead")) {
				db.prepare(sql).run(...(parameters ?? []));
				return [];
			}
			if (e.message.includes("database is locked")) {
				await setTimeout(500);
				return await storeClient.query(sql, parameters);
			}
			console.error(e, { cause: { sql, parameters } });
			throw e;
		}
	},
	after: () => db.close(),
};

let ready;
const waitForStart = async () => {
	if (ready) return;
	try {
		await storeClient.query("SELECT 1");
		ready = 1;
	} catch (error) {
		console.info("Waiting for sqlite to start...", error);
		await setTimeout(500);
		return await waitForStart();
	}
};
await waitForStart();
