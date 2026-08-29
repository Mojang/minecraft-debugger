import { defineConfig } from 'vite';
import { resolve } from 'path';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
    // VS Code webviews load the entry script through an asWebviewUri, so asset
    // URLs must be resolved relative to that script rather than from `/`.
    base: './',
    plugins: [react()],
    build: {
        outDir: 'build',
        rollupOptions: {
            output: {
                entryFileNames: `assets/[name].js`,
                chunkFileNames: `assets/[name].js`,
                assetFileNames: `assets/[name].[ext]`,
            },
            input: {
                diagnosticsPanel: resolve(__dirname, 'diagnostics_panel.html'),
                homePanel: resolve(__dirname, 'home_panel.html'),
            },
        },
        minify: false,
        sourcemap: 'inline',
    },
});
