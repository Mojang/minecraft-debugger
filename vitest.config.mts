import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['src/**/*.test.ts'],
        exclude: ['webview-ui'],
        alias: { vscode: 'src/mocks/vscode.ts' },
        watch: false,
    },
});
