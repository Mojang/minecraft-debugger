module.exports = {
    branches: ['main', 'test'],
    plugins: [
        '@semantic-release/commit-analyzer',
        '@semantic-release/release-notes-generator',
        [
            'semantic-release-vsce',
            {
                packageVsix: true,
            },
        ],
        [
            '@semantic-release/github',
            {
                assets: [
                    {
                        path: '*.vsix',
                    },
                ],
            },
        ],
    ],
};
