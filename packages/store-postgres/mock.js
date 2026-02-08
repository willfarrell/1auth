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
		//  if (sql.trim().substring(0, 6) === "CREATE") {
		//    console.log('|> postgres '+sql.trim().split('\n')[0])
		// } else if (sql.trim().substring(0, 6) === "DELETE" && !sql.includes('WHERE')) {
		//  console.log('|> postgres '+sql.trim())
		// } else if (sql.trim().substring(0, 4) === "DROP") {
		//  console.log('|> postgres '+sql.trim())
		// } //else {
		//   const query = `SELECT * FROM pg_stat_activity WHERE state = 'active'`
		//   const res = await pgClient.query(query).then(res => {
		//     return res.rows.filter(item => item.query !== query)
		//   })
		//   console.log('|> postgres ', res.length, JSON.stringify(res))
		// }
		// wait for last command to complete
		// const query = `SELECT * FROM pg_stat_activity WHERE state = 'active'`
		// const res = await pgClient.query(query).then(res => {
		//   return res.rows.filter(item => item.query !== query).map(item => item.query)
		// })
		//await setTimeout(500)
		// if (res.length) {
		//   console.log('Waiting for postgres to finish last query...')
		//   await setTimeout(500)
		//   return storeClient.query(sql, parameters)
		// }

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
const waitForStart = async () => {
	if (ready) return;
	try {
		await storeClient.query("SELECT 1");
		ready = 1;
	} catch (error) {
		console.info("Waiting for postgres to start...", error);
		await setTimeout(500);
		return await waitForStart();
	}
};
await waitForStart();
