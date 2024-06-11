import { defineConfig } from 'vite';
import { resolve } from 'path';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
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
