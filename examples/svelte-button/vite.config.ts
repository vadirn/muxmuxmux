import adapter from "@sveltejs/adapter-static";
import { sveltekit } from "@sveltejs/kit/vite";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				runes: true,
			},
			preprocess: vitePreprocess(),
			adapter: adapter({
				pages: "build",
				assets: "build",
				fallback: undefined,
				precompress: false,
				strict: true,
			}),
		}),
		tailwindcss(),
	],
});
