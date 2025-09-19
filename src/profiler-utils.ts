// Copyright (C) Microsoft Corporation.  All rights reserved.

import { SourceMaps } from './source-maps';
import * as path from 'path';
import { MappedPosition } from 'source-map';
import { ModuleMapping } from './session';

interface ProfilerCallFrame {
    functionName: string;
    scriptId: string;
    url: string;
    lineNumber: number;
    columnNumber: number;
}

interface ProfilerLocation {
    lineNumber: number;
    columnNumber: number;
    source: {
        name: string;
        path: string;
        sourceReference: number;
    };
}

interface ProfilerData {
    callFrame: ProfilerCallFrame;
    locations: ProfilerLocation[];
}

export interface ProfilerVScodeLocations {
    locations: ProfilerData[];
}
export async function injectSourceMapIntoProfilerCapture(
    moduleMapping: ModuleMapping | undefined,
    moduleMaps: Record<string, SourceMaps> | undefined,
    baseSourceMaps: SourceMaps,
    rawData: string
): Promise<string | undefined> {
    const data = Buffer.from(rawData, 'base64');
    const dataJson = JSON.parse(`${data}`);
    const tsCodeFunctionCalls: ProfilerVScodeLocations = { locations: [] };
    tsCodeFunctionCalls.locations = dataJson['$vscode']?.['locations'];

    let hasChanges = false;
    const callFrameMap: Map<string, ProfilerCallFrame> = new Map<string, ProfilerCallFrame>();

    //Locations Changes
    for (let i = 0; i < tsCodeFunctionCalls.locations.length; i++) {
        const profilerData: ProfilerData = tsCodeFunctionCalls.locations[i];
        const callFrame = profilerData.callFrame;
        const locations = profilerData.locations[0];

        if (callFrame === undefined || locations === undefined) {
            continue;
        }

        const mappedFilename = moduleMapping?.[callFrame.url];
        const sourceMaps = mappedFilename ? moduleMaps![callFrame.url] : baseSourceMaps;
        const sourceFilename = mappedFilename ? path.basename(mappedFilename) : callFrame.url;

        let originalPosition: MappedPosition | undefined;

        try {
            originalPosition = await sourceMaps.getOriginalPositionFor({
                source: sourceFilename,
                line: callFrame.lineNumber - 1,
                column: callFrame.columnNumber,
            });
        } catch (_e) {
            continue;
        }

        if (!originalPosition) {
            continue;
        }

        callFrame.url = originalPosition.source;
        callFrame.lineNumber = originalPosition.line;
        callFrame.columnNumber = originalPosition.column;
        locations.lineNumber = originalPosition.line;
        locations.columnNumber = originalPosition.column;
        locations.source.path = originalPosition.source;

        const pathSplit = originalPosition.source.split('\\');
        if (pathSplit.length === 0) {
            locations.source.name = originalPosition.source;
        } else {
            locations.source.name = pathSplit[pathSplit.length - 1];
        }

        callFrameMap.set(callFrame.functionName, callFrame);

        hasChanges = true;
    }

    //Find Matching Nodes
    const nodes = dataJson['nodes'];
    for (let i = 0; i < nodes.length; i++) {
        const nodeCallFrame: ProfilerCallFrame = nodes[i]['callFrame'];
        const cachedCallFrame = callFrameMap.get(nodeCallFrame.functionName);
        if (cachedCallFrame) {
            nodeCallFrame.url = cachedCallFrame.url;
            nodeCallFrame.lineNumber = cachedCallFrame.lineNumber;
            nodeCallFrame.columnNumber = cachedCallFrame.columnNumber;
        }
    }

    if (!hasChanges) {
        return undefined;
    }

    return dataJson;
}
