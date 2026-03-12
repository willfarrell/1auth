<script>
import LayoutAsideNav from "@design-system/components/LayoutAsideNav.svelte";
import { page } from "$app/state";

const { params, data, form } = page;

const nav = {
	"Getting Started": {
		Introduction: "/docs",
		"Quick Start": "/docs/intro/quick-start",
		Architecture: "/docs/intro/architecture",
		Contributing: "/docs/intro/contributing",
		Roadmap: "/docs/intro/roadmap",
		"Upgrade Guide": "/docs/intro/upgrade",
	},
	Account: {
		account: "/docs/packages/account",
		"account-username": "/docs/packages/account-username",
		session: "/docs/packages/session",
	},
	Authentication: {
		authn: "/docs/packages/authn",
		"authn-webauthn": "/docs/packages/authn-webauthn",
		"authn-recovery-codes": "/docs/packages/authn-recovery-codes",
		"authn-access-token": "/docs/packages/authn-access-token",
	},
	Messengers: {
		messenger: "/docs/packages/messenger",
		"messenger-email-address": "/docs/packages/messenger-email-address",
	},
	Notifications: {
		notify: "/docs/packages/notify",
		"notify-sqs": "/docs/packages/notify-sqs",
	},
	Stores: {
		store: "/docs/packages/store",
		"store-dynamodb": "/docs/packages/store-dynamodb",
		"store-postgres": "/docs/packages/store-postgres",
		"store-sqlite": "/docs/packages/store-sqlite",
		"store-d1": "/docs/packages/store-d1",
	},
	Security: {
		crypto: "/docs/packages/crypto",
		Algorithms: "/docs/security/algorithms",
		"Threat Model": "/docs/security/threat-model",
	},
};
</script>

<LayoutAsideNav {nav} />
