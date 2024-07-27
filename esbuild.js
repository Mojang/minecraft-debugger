const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

async function main() {
    const buildOptions = {
        entryPoints: ['src/extension.ts'],
        bundle: true,
        format: 'cjs',
        minify: production,
        sourcemap: !production,
        sourcesContent: false,
        platform: 'node',
        outfile: 'dist/extension.js',
        external: ['vscode'],
        logLevel: 'silent',
        plugins: [esbuildProblemMatcherPlugin],
    };

    if (watch) {
        const ctx = await esbuild.build({
            ...buildOptions,
            watch: {
                onRebuild(error, result) {
                    if (error) {
                        console.error('watch build failed:', error);
                    } else {
                        console.log('watch build succeeded:', result);
                    }
                },
            },
        });
        console.log('[watch] build started');
    } else {
        await esbuild.build(buildOptions);
        console.log('build finished');
    }
}

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
    name: 'esbuild-problem-matcher',

    setup(build) {
        build.onStart(() => {
            console.log('[watch] build started');
        });
        build.onEnd(result => {
            result.errors.forEach(({ text, location }) => {
                console.error(`✘ [ERROR] ${text}`);
                if (location) {
                    console.error(`    ${location.file}:${location.line}:${location.column}:`);
                }
            });
            console.log('[watch] build finished');
        });
    },
};

main().catch(e => {
    console.error(e);
    process.exit(1);
});
