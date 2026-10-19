<script>
import BodyHeader from "@willfarrell-ds/svelte/components/BodyHeader.svelte";
import Icon from "@willfarrell-ds/svelte/components/Icon.svelte";
import Image from "@willfarrell-ds/svelte/components/Image.svelte";
import InputSearch from "@willfarrell-ds/svelte/components/InputSearch.svelte";
import A from "@willfarrell-ds/svelte/elements/a.svelte";
import Button from "@willfarrell-ds/svelte/elements/button.svelte";
import Div from "@willfarrell-ds/svelte/elements/div.svelte";
import Form from "@willfarrell-ds/svelte/elements/form.svelte";
import Search from "@willfarrell-ds/svelte/elements/search.svelte";
import Span from "@willfarrell-ds/svelte/elements/span.svelte";
import { page } from "$app/state";

const { data, form } = page;

const navTopLinks = {
	[`v${data.version}`]: true,
	GitHub: `https://github.com/willfarrell/1auth`,
};

const navStartLinks = {
	Documentation: "/docs",
	Packages: "/docs/packages/account",
	Security: "/docs/security/algorithms",
};
const navEndLinks = null;
const navPrimary = null;
</script>

<BodyHeader {navTopLinks} {navStartLinks} {navEndLinks} {navPrimary}>
    {#snippet start()}
        <A href="/">
          <Image
            src="/img/logo.svg"
            alt="1auth logo, to the homepage"
            height="48"
            width="48"
            decoding="auto"
            fetchpriority="high"
            loading="eager"
          />
        </A>
    {/snippet}
    {#snippet end()}
        <Search>
        <Form method="GET" action="/search">
           	<Div class="group">
				<InputSearch id="q" aria-label="Search" placeholder="Search" size="18" aria-keyshortcuts="Meta+K Control+K" value={form?.q ?? ""} />
				<Button type="submit"><Icon src="/img/icons.svg#search" /><Span class="visually-hidden">Search</Span></Button>
			</Div>
        </Form></Search>
    {/snippet}
</BodyHeader>
