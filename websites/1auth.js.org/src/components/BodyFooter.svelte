<script>
import BodyFooter from "@design-system/components/BodyFooter.svelte";
import Image from "@design-system/components/Image.svelte";
import A from "@design-system/elements/a.svelte";
import { page } from "$app/state";

const { children } = $props();
const { url, params, data, form } = page;

const navLinks = {
	Docs: {
		Documentation: "/docs",
		"Quick Start": "/docs/intro/quick-start",
		Architecture: "/docs/intro/architecture",
	},
	"Community & support": {
		GitHub: "https://github.com/willfarrell/1auth",
		npm: "https://www.npmjs.com/package/@1auth/authn",
	},
	More: {
		"OpenSSF Scorecard":
			"https://scorecard.dev/viewer/?uri=github.com/willfarrell/1auth",
		Sponsor: "https://github.com/sponsors/willfarrell",
	},
};
</script>

<BodyFooter navLinks={navLinks}>
    {#snippet logo()}
        <A href="/">
          <Image
            src="/img/logo.svg"
            alt="1auth logo, to the homepage"
            width="48"
            height="48"
          />
        </A>
    {/snippet}
</BodyFooter>
