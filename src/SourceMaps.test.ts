import { describe, it, expect } from 'vitest';
import { SourceMaps } from './SourceMaps';
import path from 'path';

describe('SourceMaps', () => {

    const linesToVerify = [
        17, 28, 35, 52, 67, 81, 86, 94, 103, 109, 115, 119
    ];

    const verifyLines = async (sourceMaps: SourceMaps, originalLocalAbsolutePath: string, generatedRemoteLocalPath: string) => {
        for (const sourceLine of linesToVerify) {
            const generatedPosition = await sourceMaps.getGeneratedPositionFor({
                source: originalLocalAbsolutePath,
                column: 0,
                line: sourceLine,
            });
            const originalPosition = await sourceMaps.getOriginalPositionFor({
                source: generatedRemoteLocalPath,
                column: 0,
                line: generatedPosition.line || 0,
            });
            expect(sourceLine).toBe(originalPosition.line);
        }
    };

    //
    // No source maps
    //
    it('should leave line number unchanged between generated and original if no source maps', async () => {
        const localRoot = path.resolve('./test-source-maps/scripts-and-source-maps');
        const sourceMaps = new SourceMaps(localRoot);
        const originalLocalAbsolutePath = path.join(localRoot, 'main.js');
        const generatedRemoteLocalPath = await sourceMaps.getGeneratedRemoteRelativePath(originalLocalAbsolutePath);
        expect(generatedRemoteLocalPath).toBe('main.js');
        verifyLines(sourceMaps, originalLocalAbsolutePath, generatedRemoteLocalPath);
    });

    //
    // External source maps
    //
    it('should use main.ts source map (main.js.map) to generate translated line numbers to script main.js and back', async () => {
        const localRoot = path.resolve('./test-source-maps/src');
        const sourceMapRoot = path.resolve('./test-source-maps/external-source-maps/scripts');
        const sourceMaps = new SourceMaps(localRoot, sourceMapRoot);
        const originalLocalAbsolutePath = path.join(localRoot, 'main.ts');
        const generatedRemoteLocalPath = await sourceMaps.getGeneratedRemoteRelativePath(originalLocalAbsolutePath);
        expect(generatedRemoteLocalPath).toBe('main.js');
        verifyLines(sourceMaps, originalLocalAbsolutePath, generatedRemoteLocalPath);
    });

    //
    // Inline source maps
    //
    it('should use inline source map to generate translated line numbers to script main.js and back', async () => {
        const localRoot = path.resolve('./test-source-maps/src');
        const sourceMapRoot = path.resolve('./test-source-maps/inline-source-maps/scripts');
        const sourceMaps = new SourceMaps('', sourceMapRoot, undefined, true);
        const originalLocalAbsolutePath = path.join(localRoot, 'main.ts');
        const generatedRemoteLocalPath = await sourceMaps.getGeneratedRemoteRelativePath(originalLocalAbsolutePath);
        expect(generatedRemoteLocalPath).toBe('main.js');
        verifyLines(sourceMaps, originalLocalAbsolutePath, generatedRemoteLocalPath);
    });
});
