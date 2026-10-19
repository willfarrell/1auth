<script>
import H1 from "@willfarrell-ds/svelte/components/Heading1.svelte";
import LayoutAside from "@willfarrell-ds/svelte/components/LayoutAside.svelte";
import LayoutTableOfContents from "@willfarrell-ds/svelte/components/LayoutTableOfContents.svelte";
import NavScrollspy from "@willfarrell-ds/svelte/components/NavScrollspy.svelte";
import A from "@willfarrell-ds/svelte/elements/a.svelte";
import Hgroup from "@willfarrell-ds/svelte/elements/hgroup.svelte";
import Li from "@willfarrell-ds/svelte/elements/li.svelte";
import Ol from "@willfarrell-ds/svelte/elements/ol.svelte";
import codeblockActionsUrl from "@willfarrell-ds/vanilla/components/ds-codeblock-actions.js?worker&url";
import copyUrl from "@willfarrell-ds/vanilla/components/ds-copy.js?worker&url";
import AsideNav from "./AsideNav.svelte";

const { title = "Documentation", description = "", headings = [], children } = $props();
</script>
<svelte:head>
	<link rel="modulepreload" href={codeblockActionsUrl} />
	<link rel="modulepreload" href={copyUrl} />
	<title>{title} | 1auth</title>
	{#if description}<meta name="description" content={description} />{/if}
</svelte:head>
<LayoutAside>
    {#snippet aside()}
      <AsideNav />
    {/snippet}
<LayoutTableOfContents>
    {#snippet header()}
		<Hgroup>
			<H1>{title}</H1>
		</Hgroup>
    {/snippet}
    {#snippet aside()}
		<NavScrollspy>
			<Ol>
				{#if headings.length > 0}
					{#each headings as heading}
						<Li><A href="#{heading.id}">{heading.text}</A></Li>
					{/each}
				{/if}
			</Ol>
		</NavScrollspy>
    {/snippet}
	{@render children?.()}
</LayoutTableOfContents>
</LayoutAside>
