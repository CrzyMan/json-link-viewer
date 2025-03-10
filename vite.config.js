import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
	plugins: [
        nodePolyfills({include: ['zlib']}),
        sveltekit(),
    ],
});
