//import { stderr } from "node:process"; // CloudFlare doesn't support
// import { NIL as uuidNil } from "uuid";

const uuidNil = "00000000-0000-0000-0000-000000000000";
export async function handleError({ kind, error, event }) {
	// Kit 3 also passes expected `error()` throws here; v2 never did
	if (kind === "app") return;
	console.error(
		`${JSON.stringify({
			log_level: "ERROR",
			message: error?.message ?? "Internal Error",
			stack: error?.stack,
			cause: error?.cause,
			status_code: error?.status ?? 500,
			request_id: uuidNil,
			event, // TODO need to remove sensitive data before logging (ip, user agent, )
		})}\n`,
	);
}
