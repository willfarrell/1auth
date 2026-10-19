<script>
import BodyFooter from "@willfarrell-ds/svelte/components/BodyFooter.svelte";
import Image from "@willfarrell-ds/svelte/components/Image.svelte";
import A from "@willfarrell-ds/svelte/elements/a.svelte";

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
