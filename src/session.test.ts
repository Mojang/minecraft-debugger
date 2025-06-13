/* eslint-disable indent */
import { describe, it, expect, vi } from 'vitest';
import { Session } from './session';
import path from 'path';
import { SourceMaps } from './source-maps';

vi.mock('vscode');

describe('Session', () => {
    it('Can process mapped modules', async () => {
        const localRoot = path.resolve('./test-source-maps/src');
        const sourceMapRoot = path.resolve('./test-source-maps/external-source-maps/scripts');
        const sourceMaps = new SourceMaps(localRoot, sourceMapRoot);
        const moduleMapping = {
            'module.js': './test-source-maps/external-source-maps/module/module.js',
        };
        const moduleMaps = Session.createModuleMap(localRoot, moduleMapping);

        const stackFrames = await Session.mapStackFrames(
            [
                {
                    id: 0,
                    name: 'fakeModuleCall',
                    filename: 'module.js',
                    line: 4,
                    column: 18,
                },
                {
                    id: 1,
                    name: 'anonymous',
                    filename: 'main.js',
                    line: 93,
                    column: 10,
                },
            ],
            moduleMapping,
            moduleMaps,
            sourceMaps
        );

        expect(stackFrames[0].id).toBe(0);
        expect(stackFrames[0].source!.name).toBe('module.ts');
        expect(stackFrames[0].line).toBe(5);
        expect(stackFrames[0].column).toBe(31);
        expect(stackFrames[0].name).toBe('fakeModuleCall');

        expect(stackFrames[1].id).toBe(1);
        expect(stackFrames[1].source!.name).toBe('main.ts');
        expect(stackFrames[1].line).toBe(130);
        expect(stackFrames[1].column).toBe(20);
        expect(stackFrames[1].name).toBe('anonymous');
    });

    it('Can process no mapped modules', async () => {
        const localRoot = path.resolve('./test-source-maps/src');
        const sourceMapRoot = path.resolve('./test-source-maps/external-source-maps/scripts');
        const sourceMaps = new SourceMaps(localRoot, sourceMapRoot);

        const stackFrames = await Session.mapStackFrames(
            [
                {
                    id: 0,
                    name: 'fakeModuleCall',
                    filename: 'module.js',
                    line: 3,
                    column: 10,
                },
                {
                    id: 1,
                    name: 'anonymous',
                    filename: 'main.js',
                    line: 93,
                    column: 10,
                },
            ],
            undefined,
            undefined,
            sourceMaps
        );

        expect(stackFrames[0].id).toBe(0);
        expect(stackFrames[0].line).toBe(0);
        expect(stackFrames[0].column).toBe(0);
        expect(stackFrames[0].name).toBe('fakeModuleCall');

        expect(stackFrames[1].id).toBe(1);
        expect(stackFrames[1].source!.name).toBe('main.ts');
        expect(stackFrames[1].line).toBe(130);
        expect(stackFrames[1].column).toBe(20);
        expect(stackFrames[1].name).toBe('anonymous');
    });
});
