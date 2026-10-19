import { resolve } from "node:path";
import adapter from "@sveltejs/adapter-cloudflare";
import { sveltekit } from "@sveltejs/kit/vite";
import { mdsvex } from "mdsvex";
import { defineConfig } from "vite";
import mkcert from "vite-plugin-mkcert";
import sriPrerendered from "vite-plugin-sri";
import { rehypeAddHeadingIds } from "./src/lib/rehype-add-heading-ids.js";
import { rehypeCopyPre } from "./src/lib/rehype-copy-pre.js";
import { remarkExtractHeadings } from "./src/lib/remark-extract-headings.js";
import tardisec from "./tardisec.json" with { type: "json" };

const domain = process.env.ORIGIN ?? "1auth.js.org";

export default defineConfig({
	plugins: [
		sveltekit({
			adapter: adapter({}),
			appDir: "_",
			csp: tardisec["svelte.config.js"]["Content-Security-Policy"],
			// Also the CSRF trusted origin and prerender url.origin
			paths: {
				origin: `https://${domain}`,
			},
			prerender: {
				concurrency: 5,
				crawl: true,
				entries: ["/", "/sitemap.xml", "/llms.txt"],
				handleHttpError: "warn",
				handleMissingId: "warn",
				handleEntryGeneratorMismatch: "warn",
			},
			preprocess: [
				mdsvex({
					extensions: [".md"],
					layout: {
						_: resolve("./src/components/docs/mdsvex-layout.svelte"),
					},
					remarkPlugins: [remarkExtractHeadings],
					rehypePlugins: [rehypeAddHeadingIds, rehypeCopyPre],
				}),
			],
			extensions: [".svelte", ".md"],
			onwarn(warning, defaultHandler) {
				if (warning.code === "attribute_avoid_is") return;
				if (warning.code === "non_reactive_update") return;

				warning.message = `[${warning.code}] ${warning.message}`;
				defaultHandler(warning);
			},
		}),
		mkcert({ mkcertPath: "/opt/homebrew/bin/mkcert" }),
		sriPrerendered(),
	],
	build: {
		assetsInlineLimit: 0,
	},
	ssr: {
		noExternal: ["prismjs"],
	},
});
