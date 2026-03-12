<script>
import Card from "@design-system/components/Card.svelte";
import H1 from "@design-system/components/Heading1.svelte";
import H2 from "@design-system/components/Heading2.svelte";
import H3 from "@design-system/components/Heading3.svelte";
import Icon from "@design-system/components/Icon.svelte";
import Image from "@design-system/components/Image.svelte";
import LayoutSlices from "@design-system/components/LayoutSlices.svelte";
import A from "@design-system/elements/a.svelte";
import Div from "@design-system/elements/div.svelte";
import Li from "@design-system/elements/li.svelte";
import P from "@design-system/elements/p.svelte";
import Section from "@design-system/elements/section.svelte";
import Span from "@design-system/elements/span.svelte";
import Ul from "@design-system/elements/ul.svelte";
import { page } from "$app/state";

const { data } = page;
</script>

<svelte:head>
    <title>1auth</title>
    <meta
        name="description"
        content="Secure authentication and session management modules for Node.js"
    />
</svelte:head>
<LayoutSlices>
    <Section class="slice hero vertical">
        <Div class="inline-center">
            <Image
                alt="1auth logo"
                src="/img/logo.svg"
                width="96"
                height="96"
                decoding="auto"
                fetchpriority="high"
                loading="eager"
            />
            <H1>Secure authentication &amp; session management for Node.js</H1>

            <P
                >ORM-like modules for accounts, authentication, messengers, and
                sessions. Consistent APIs with encryption by default and
                industry-standard cryptographic algorithms.</P
            >
            <Div role="group">
                <P>
                    <A href="/docs" class="button"
                        ><Span>Get started</Span>
                        <Icon src="/img/icons.svg#arrow-inline-end" /></A
                    ></P
                ></Div
            >
            <H2 class="visually-hidden">Project highlights</H2>
            <Ul class="grid">
                <Li class="stat">
                    <H3
                        ><Icon src="/img/icons.svg#shield" />
                        <Span>OWASP</Span></H3
                    >
                    <P>ASVS v5.0 Level 3</P>
                </Li>
                <Li class="stat">
                    <H3
                        ><Icon src="/img/icons.svg#list-check" />
                        <Span>96%</Span></H3
                    >
                    <P>Code coverage</P>
                </Li>
                <Li class="stat">
                    <H3
                        ><Icon src="/img/icons.svg#lock" />
                        <Span>SLSA 3</Span></H3
                    >
                    <P>Supply chain security</P>
                </Li>
            </Ul>
        </Div>
    </Section>
    <Section class="slice grid">
        <Div class="inline-center">
            <H2>Everything you need for secure auth</H2>
        </Div>
        <Ul class="grid">
            <Li class="card feature">
                <H3>Secure by default</H3>
                <P
                    >ChaCha20-Poly1305 encryption, Argon2id password hashing,
                    HMAC-signed sessions, and timing-safe authentication out of
                    the box.</P
                >
            </Li>
            <Li class="card feature">
                <H3>Consistent APIs</H3>
                <P
                    >ORM-like interface for accounts, credentials, messengers,
                    and sessions. Encryption and decryption applied
                    transparently.</P
                >
            </Li>
            <Li class="card feature">
                <H3>Multi-factor auth</H3>
                <P
                    >WebAuthn/FIDO2, recovery codes, and access tokens. Pluggable
                    credential types with a unified authentication flow.</P
                >
            </Li>
            <Li class="card feature">
                <H3>Multiple backends</H3>
                <P
                    >DynamoDB, PostgreSQL, SQLite, and Cloudflare D1. Swap storage
                    backends without changing your application code.</P
                >
            </Li>
            <Li class="card feature">
                <H3>Per-record encryption</H3>
                <P
                    >Every sensitive field is encrypted before storage with
                    per-user derived keys. Digests are used for lookups instead
                    of plaintext.</P
                >
            </Li>
            <Li class="card feature">
                <H3>Battle-tested security</H3>
                <P
                    >SAST, DAST, SCA, fuzzing, and performance benchmarks run on
                    every commit. OpenSSF Scorecard and SLSA 3 compliant.</P
                >
            </Li>
        </Ul>
    </Section>
    <Section class="slice vertical">
        <Div class="inline-center">
            <H2>Core packages</H2>
            <P>Modular packages that work together or standalone.</P>
        </Div>
        <Ul class="grid">
            <Card class="package" id="account">
                <H3><A href="/docs/packages/account">account</A></H3>
                <P>User account management with encrypted storage.</P>
            </Card>
            <Card class="package" id="authn">
                <H3><A href="/docs/packages/authn">authn</A></H3>
                <P>Core authentication with multi-factor support.</P>
            </Card>
            <Card class="package" id="session">
                <H3><A href="/docs/packages/session">session</A></H3>
                <P>HMAC-signed session management.</P>
            </Card>
            <Card class="package" id="messenger">
                <H3><A href="/docs/packages/messenger">messenger</A></H3>
                <P>Messaging framework for email verification.</P>
            </Card>
            <Card class="package" id="crypto">
                <H3><A href="/docs/packages/crypto">crypto</A></H3>
                <P>Cryptographic utilities for encryption and hashing.</P>
            </Card>
            <Card class="package" id="store">
                <H3><A href="/docs/packages/store">store</A></H3>
                <P>Pluggable storage backends for persistence.</P>
            </Card>
        </Ul>
    </Section>
    <Section class="slice vertical">
        <Div class="inline-center">
            <H2>Ready to get started?</H2><P>
                Install 1auth and start building secure authentication today.
            </P>
            <A href="/docs" class="button"
                ><Span>Read the docs</Span>
                <Icon src="/img/icons.svg#arrow-inline-end" />
            </A>
        </Div>
    </Section>
    <Section class="slice vertical">
        <Div class="inline-center">
            <P>
                <A href="https://github.com/sponsors/willfarrell" class="button"
                    ><Icon src="/img/icons.svg#heart" /><Span
                        >Become a sponsor</Span
                    >
                </A></P
            >
        </Div>
    </Section>
</LayoutSlices>
