import { describe, it, expect, vi } from 'vitest';
import { Session } from './session';
import { injectSourceMapIntoProfilerCapture } from './profiler-utils';
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

    it('Could not find source map to inject into profiler', async () => {
        const localRoot = path.resolve('./test-source-maps/src');
        const sourceMapRoot = path.resolve('./test-source-maps/external-source-maps/scripts');
        const sourceMaps = new SourceMaps(localRoot, sourceMapRoot);
        const moduleMapping = {
            'module.js': './test-source-maps/external-source-maps/module/module.js',
        };
        const moduleMaps = Session.createModuleMap(localRoot, moduleMapping);
        const mockData = {
            nodes: [
                {
                    id: 0,
                    hitCount: 2,
                    callFrame: {
                        functionName: 'fakeModuleCall',
                        scriptId: '974',
                        url: 'fakeModule.js',
                        lineNumber: 5,
                        columnNumber: 18,
                    },
                    locationId: 0,
                },
            ],
            samples: [0, 0, 2, 0, 2],
            timeDeltas: [0, 7206663, 297, 9994911, 140],
            startTime: 1757464170077429,
            endTime: 1757464189237976,
            $vscode: {
                rootPath: '.',
                locations: [
                    {
                        callFrame: {
                            functionName: 'fakeModuleCall',
                            scriptId: '974',
                            url: 'fakeModule.js',
                            lineNumber: 5,
                            columnNumber: 18,
                        },
                        locations: [
                            {
                                lineNumber: 5,
                                columnNumber: 18,
                                source: {
                                    name: 'fakeModule.js',
                                    path: 'fakeModule.js',
                                    sourceReference: 0,
                                },
                            },
                        ],
                    },
                ],
            },
        };

        const encoder = new TextEncoder();
        const encodedData = Buffer.from(encoder.encode(JSON.stringify(mockData))).toString('base64');

        const injectedData = await injectSourceMapIntoProfilerCapture(
            moduleMapping,
            moduleMaps,
            sourceMaps,
            JSON.stringify(encodedData)
        );

        expect(injectedData).toBe(undefined);
    });

    it('Can inject source map into profiler', async () => {
        const localRoot = path.resolve('./test-source-maps/src');
        const sourceMapRoot = path.resolve('./test-source-maps/external-source-maps/scripts');
        const sourceMaps = new SourceMaps(localRoot, sourceMapRoot);
        const moduleMapping = {
            'module.js': './test-source-maps/external-source-maps/module/module.js',
        };
        const moduleMaps = Session.createModuleMap(localRoot, moduleMapping);

        const mockData = {
            nodes: [
                {
                    id: 0,
                    hitCount: 2,
                    callFrame: {
                        functionName: 'fakeModuleCall',
                        scriptId: '974',
                        url: 'module.js',
                        lineNumber: 5,
                        columnNumber: 18,
                    },
                    locationId: 0,
                },
                {
                    id: 1,
                    hitCount: 1,
                    callFrame: {
                        functionName: '<anonymous>',
                        scriptId: '974',
                        url: 'main.js',
                        lineNumber: 94,
                        columnNumber: 10,
                    },
                    children: [0, 2],
                    locationId: 1,
                },
            ],
            samples: [0, 0, 2, 0, 2],
            timeDeltas: [0, 7206663, 297, 9994911, 140],
            startTime: 1757464170077429,
            endTime: 1757464189237976,
            $vscode: {
                rootPath: '.',
                locations: [
                    {
                        callFrame: {
                            functionName: 'fakeModuleCall',
                            scriptId: '974',
                            url: 'module.js',
                            lineNumber: 5,
                            columnNumber: 18,
                        },
                        locations: [
                            {
                                lineNumber: 5,
                                columnNumber: 18,
                                source: {
                                    name: 'module.js',
                                    path: 'module.js',
                                    sourceReference: 0,
                                },
                            },
                        ],
                    },
                    {
                        callFrame: {
                            functionName: '<anonymous>',
                            scriptId: '974',
                            url: 'main.js',
                            lineNumber: 94,
                            columnNumber: 10,
                        },
                        locations: [
                            {
                                lineNumber: 94,
                                columnNumber: 10,
                                source: {
                                    name: 'main.js',
                                    path: 'main.js',
                                    sourceReference: 0,
                                },
                            },
                        ],
                    },
                ],
            },
        };

        const encoder = new TextEncoder();
        const encodedData = Buffer.from(encoder.encode(JSON.stringify(mockData))).toString('base64');

        const injectedData = await injectSourceMapIntoProfilerCapture(
            moduleMapping,
            moduleMaps,
            sourceMaps,
            JSON.stringify(encodedData)
        );

        const jsonData = JSON.parse(JSON.stringify(injectedData));

        const fakeModuleCallNodeCallFrame = jsonData['nodes']?.[0]['callFrame'];
        expect(fakeModuleCallNodeCallFrame['functionName']).toBe('fakeModuleCall');
        expect(fakeModuleCallNodeCallFrame['url']).toBe(path.resolve(localRoot, 'module.ts'));
        expect(fakeModuleCallNodeCallFrame['lineNumber']).toBe(5);
        expect(fakeModuleCallNodeCallFrame['columnNumber']).toBe(31);

        const fakeModuleCallCallFrame = jsonData['$vscode']?.['locations']?.[0]['callFrame'];
        expect(fakeModuleCallCallFrame['functionName']).toBe('fakeModuleCall');
        expect(fakeModuleCallCallFrame['url']).toBe(path.resolve(localRoot, 'module.ts'));
        expect(fakeModuleCallCallFrame['lineNumber']).toBe(5);
        expect(fakeModuleCallCallFrame['columnNumber']).toBe(31);

        const fakeModuleCallLocation = jsonData['$vscode']?.['locations']?.[0]['locations'][0];
        expect(fakeModuleCallLocation['lineNumber']).toBe(5);
        expect(fakeModuleCallLocation['columnNumber']).toBe(31);

        const moduleSourceName = fakeModuleCallLocation['source']['name'].split('/');
        expect(moduleSourceName[moduleSourceName.length - 1]).toBe('module.ts');
        expect(fakeModuleCallLocation['source']['path']).toBe(path.resolve(localRoot, 'module.ts'));

        const anonymousNodeCallFrame = jsonData['nodes']?.[1]['callFrame'];
        expect(anonymousNodeCallFrame['functionName']).toBe('<anonymous>');
        expect(anonymousNodeCallFrame['url']).toBe(path.resolve(localRoot, 'main.ts'));
        expect(anonymousNodeCallFrame['lineNumber']).toBe(130);
        expect(anonymousNodeCallFrame['columnNumber']).toBe(20);

        const anonymousCallFrame = jsonData['$vscode']?.['locations']?.[1]['callFrame'];
        expect(anonymousCallFrame['functionName']).toBe('<anonymous>');
        expect(anonymousCallFrame['url']).toBe(path.resolve(localRoot, 'main.ts'));
        expect(anonymousCallFrame['lineNumber']).toBe(130);
        expect(anonymousCallFrame['columnNumber']).toBe(20);

        const anonymousLocation = jsonData['$vscode']?.['locations']?.[1]['locations'][0];
        expect(anonymousLocation['lineNumber']).toBe(130);
        expect(anonymousLocation['columnNumber']).toBe(20);
        const mainSourceName = anonymousLocation['source']['name'].split('/');
        expect(mainSourceName[mainSourceName.length - 1]).toBe('main.ts');

        expect(anonymousLocation['source']['path']).toBe(path.resolve(localRoot, 'main.ts'));
    });
});
