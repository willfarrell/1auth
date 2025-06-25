import { DatabaseSync } from "node:sqlite";
import { setTimeout } from "node:timers/promises";

const db = new DatabaseSync(":memory:", {});
db.exec("PRAGMA journal_mode = 'wal';");

export const log = () => {};
export const storeClient = {
	query: async (sql, parameters) => {
		try {
			if (sql.substring(0, 6) === "SELECT") {
				return db.prepare(sql).all(...(parameters ?? []));
			}
			if (sql.substring(0, 6) === "DELETE") {
				return db.prepare(sql).run(...(parameters ?? []));
			}

			return db.prepare(sql).get(...(parameters ?? []));
		} catch (e) {
			if (e.message.includes("Use run() instead")) {
				return db.prepare(sql).run(...(parameters ?? []));
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
