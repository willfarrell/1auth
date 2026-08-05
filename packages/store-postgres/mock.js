// Copyright 2003 - 2026 will Farrell, and 1Auth contributors.
// SPDX-License-Identifier: MIT
import { setTimeout } from "node:timers/promises";
import pg from "pg";

pg.types.setTypeParser(1082, (v) => v); // Parse `date` and not timestamp
pg.types.setTypeParser(1700, Number.parseFloat);

const { Pool } = pg;

const pgClient = new Pool({
	host: "localhost",
	user: "postgres",
	password: "postgres",
});
export const log = () => {};
export const storeClient = {
	query: async (sql, parameters) => {
		return await pgClient
			.query(sql, parameters)
			.then((res) => {
				return res.rows;
			})
			.catch((e) => {
				console.error(e, { cause: { sql, parameters } });
				throw e;
			});
	},
	after: () => pgClient.end(),
};

let ready;
const maxRetries = 30;
const waitForStart = async (attempt = 0) => {
	if (ready) return;
	try {
		await storeClient.query("SELECT 1");
		ready = 1;
	} catch (error) {
		if (attempt >= maxRetries) {
			// Same trap as DynamoDB: a warning here means a green run that never
			// touched PostgreSQL. Skipping has to be a decision, not a default.
			if (process.env.SKIP_POSTGRES) {
				console.warn(
					"PostgreSQL not available, SKIP_POSTGRES set, skipping PostgreSQL tests",
				);
				return;
			}
			throw new Error(
				"PostgreSQL not available on localhost:5432. Start it with `npm run test:postgres`, or set SKIP_POSTGRES=1 to skip these tests deliberately.",
				{ cause: error },
			);
		}
		console.info("Waiting for postgres to start...", error);
		await setTimeout(500);
		return await waitForStart(attempt + 1);
	}
};
await waitForStart();

export const isReady = () => !!ready;
