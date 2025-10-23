// Copyright (C) Microsoft Corporation.  All rights reserved.

import { DebugProtocol } from '@vscode/debugprotocol';
import { IBreakpointsHandler } from './ibreakpoints-handler';
import { SourceMaps } from './source-maps';
import { IDebuggeeMessageSender } from './debuggee-message-sender';
import * as path from 'path';

// respond to a setBreakPointsRequest from session, deprecated.
export class BreakpointsLegacy implements IBreakpointsHandler {
    private _sourceMaps: SourceMaps;
    private _sourceBreakpointsMap: Map<string, DebugProtocol.SourceBreakpoint[]> = new Map();
    private _messageSender: IDebuggeeMessageSender;

    constructor(sourceMaps: SourceMaps, messageSender: IDebuggeeMessageSender) {
        this._sourceMaps = sourceMaps;
        this._messageSender = messageSender;
    }

    public async handleSetBreakpointsRequest(
        sourcePath: string,
        _response: DebugProtocol.SetBreakpointsResponse,
        args: DebugProtocol.SetBreakpointsArguments
    ): Promise<any> {
        // store source breakpoints per file
        this._sourceBreakpointsMap.set(sourcePath, args.breakpoints ?? []);

        // rebuild the generated breakpoints map each time a breakpoint is changed in any file
        const generatedBreakpointsMap: Map<string, DebugProtocol.SourceBreakpoint[]> = new Map();

        // get generated breakpoints from all sources
        for (const [sourcePath, sourceBreakpoints] of this._sourceBreakpointsMap) {
            const originalLocalAbsolutePath = path.normalize(sourcePath);

            const originalBreakpoints = sourceBreakpoints ?? [];
            let generatedRemoteLocalPath = undefined;

            // first get generated remote file path, will throw if fails
            generatedRemoteLocalPath = await this._sourceMaps.getGeneratedRemoteRelativePath(originalLocalAbsolutePath);

            // append to any existing breakpoints for this generated file
            if (!generatedBreakpointsMap.has(generatedRemoteLocalPath)) {
                generatedBreakpointsMap.set(generatedRemoteLocalPath, []);
            }
            const generatedBreakpoints = generatedBreakpointsMap.get(generatedRemoteLocalPath)!;

            // for all breakpoint positions set on the source file, get generated/mapped positions
            if (originalBreakpoints.length) {
                for (const originalBreakpoint of originalBreakpoints) {
                    const generatedPosition = await this._sourceMaps.getGeneratedPositionFor({
                        source: originalLocalAbsolutePath,
                        column: originalBreakpoint.column ?? 0,
                        line: originalBreakpoint.line,
                    });
                    generatedBreakpoints.push({
                        line: generatedPosition.line ?? 0,
                        column: 0,
                    });
                }
            }
        }

        // if all bps are removed from this file, ok to remove map entry after creating an empty list for client
        if (args.breakpoints === undefined || args.breakpoints.length === 0) {
            this._sourceBreakpointsMap.delete(sourcePath);
        }

        // send full set of breakpoints for each generated file, a message per file
        for (const [generatedRemoteLocalPath, generatedBreakpoints] of generatedBreakpointsMap) {
            const envelope = {
                type: 'breakpoints',
                breakpoints: {
                    path: generatedRemoteLocalPath,
                    breakpoints: generatedBreakpoints.length ? generatedBreakpoints : undefined,
                },
            };
            this._messageSender.sendDebuggeeMessage(envelope);
        }

        return {};
    }
}
