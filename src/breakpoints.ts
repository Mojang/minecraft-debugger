// Copyright (C) Microsoft Corporation.  All rights reserved.

import { DebugProtocol } from '@vscode/debugprotocol';
import { IBreakpointsHandler } from './ibreakpoints-handler';
import { SourceMaps } from './source-maps';
import { IDebuggeeMessageSender } from './debuggee-message-sender';
import * as path from 'path';

// structure to hold generated breakpoint along with info if it is from the primary source
// the primary source being the one from which the setBreakpointsRequest was initiated
interface GeneratedBreakpoint {
    isPrimary: boolean;
    breakpoint: DebugProtocol.SourceBreakpoint;
}

interface GeneratedBreakpointInfo {
    generatedPath: string;
    breakpoints: GeneratedBreakpoint[];
}

// structure of breakpoints status response from debuggee
interface BreakpointsStatus {
    breakpoints: DebugProtocol.Breakpoint[];
}

// respond to a setBreakPointsRequest from session
// - cache all breakpoints requests with a map of source to breakpoints array
// - get generated breakpoints for the source file in the request
// - then add any breakpoints from other sources that map to the same generated file
// - send complete set of breakpoints for the generated file to debuggee
// - return breakpoint status only for those from the source in the original request
export class Breakpoints implements IBreakpointsHandler {
    private _sourceMaps: SourceMaps;
    private _cachedBreakpointsMap: Map<string, DebugProtocol.SourceBreakpoint[]> = new Map();
    private _messageSender: IDebuggeeMessageSender;

    constructor(sourceMaps: SourceMaps, messageSender: IDebuggeeMessageSender) {
        this._sourceMaps = sourceMaps;
        this._messageSender = messageSender;
    }

    public async handleSetBreakpointsRequest(
        primarySourcePath: string,
        response: DebugProtocol.SetBreakpointsResponse,
        args: DebugProtocol.SetBreakpointsArguments
    ): Promise<any> {
        // cache breakpoints from all sources, so we can create a complete set of breakpoints for a given generated file
        this._cachedBreakpointsMap.set(primarySourcePath, args.breakpoints ?? []);

        // get generated breakpoints from primary source
        const generatedBreakpoints: GeneratedBreakpointInfo = await this._getGeneratedBreakpoints(
            primarySourcePath,
            args.breakpoints ?? [],
            true
        );

        // then add breakpoints from all other sources that match the generated path of the primary.
        // we need all breakpoints for a given generated file to be included in the request to MC.
        for (const [otherSourcePath, sourceBreakpoints] of this._cachedBreakpointsMap) {
            // skip self/primary, already have those
            if (otherSourcePath !== primarySourcePath) {
                const otherGeneratedBreakpoints: GeneratedBreakpointInfo = await this._getGeneratedBreakpoints(
                    otherSourcePath,
                    sourceBreakpoints,
                    false
                );
                // if same generated path as primary (ex: both go to a single main.js), add those breakpoints too
                if (otherGeneratedBreakpoints.generatedPath === generatedBreakpoints.generatedPath) {
                    for (const bp of otherGeneratedBreakpoints.breakpoints) {
                        generatedBreakpoints.breakpoints.push(bp);
                    }
                }
            }
        }

        // they come in sorted, but if we merged from multiple sources we need to re-sort
        generatedBreakpoints.breakpoints.sort((a, b) => a.breakpoint.line - b.breakpoint.line);

        // send breakpoints as a request and wait for response from MC
        const breakpointsArgs = {
            path: generatedBreakpoints.generatedPath,
            breakpoints: generatedBreakpoints.breakpoints.map(bp => bp.breakpoint.line), // just the lines, no need for columns
        };
        const rawBreakpointsStatus: any = await this._messageSender.sendDebugeeRequestAsync(response, breakpointsArgs);
        if (!this._isValidBreakpointsStatus(rawBreakpointsStatus)) {
            throw new Error('Invalid breakpoints status format from debuggee');
        }
        const breakpointsStatus: BreakpointsStatus = rawBreakpointsStatus;

        // clear entry in source breakpoints map if no breakpoints set
        if ((args.breakpoints ?? []).length === 0) {
            this._cachedBreakpointsMap.delete(primarySourcePath);
        }

        // create response breakpoints only for those from the primary source, providing 'verified' status to VSCode
        // note that handSetBreakpointsRequest is per-source, so we can't return breakpoint status from other sources
        if (generatedBreakpoints.breakpoints.length !== breakpointsStatus.breakpoints.length) {
            throw new Error('Breakpoint count mismatch between generated and received breakpoints');
        }
        // look at all breakpoints returned from MC, include only those that were from the primary source in the response
        const responseBreakpoints: DebugProtocol.Breakpoint[] = [];
        for (let i = 0; i < generatedBreakpoints.breakpoints.length; i++) {
            const genBp = generatedBreakpoints.breakpoints[i];
            if (genBp.isPrimary) {
                const verified = breakpointsStatus.breakpoints[i].verified;
                const respBp: DebugProtocol.Breakpoint = {
                    verified: verified,
                    message: verified ? undefined : 'Breakpoint could not be set, source unknown to MC.',
                };
                responseBreakpoints.push(respBp);
            }
        }

        const responseBody = { breakpoints: responseBreakpoints };
        return responseBody;
    }

    private async _getGeneratedBreakpoints(
        sourcePath: string,
        sourceBreakpoints: DebugProtocol.SourceBreakpoint[],
        isPrimary: boolean
    ): Promise<GeneratedBreakpointInfo> {
        const originalLocalAbsolutePath = path.normalize(sourcePath);

        const generatedBreakpointsInfo: GeneratedBreakpointInfo = {
            generatedPath: '',
            breakpoints: [],
        };

        generatedBreakpointsInfo.generatedPath = await this._sourceMaps.getGeneratedRemoteRelativePath(
            originalLocalAbsolutePath
        );

        // for all breakpoint positions set on the source file, get generated/mapped positions
        for (const originalBreakpoint of sourceBreakpoints) {
            const generatedPosition = await this._sourceMaps.getGeneratedPositionFor({
                source: originalLocalAbsolutePath,
                column: originalBreakpoint.column ?? 0,
                line: originalBreakpoint.line,
            });
            generatedBreakpointsInfo.breakpoints.push({
                isPrimary: isPrimary,
                breakpoint: {
                    line: generatedPosition.line ?? 0,
                    column: 0,
                },
            });
        }

        return generatedBreakpointsInfo;
    }

    private _isValidBreakpointsStatus(response: any): response is BreakpointsStatus {
        return (
            response &&
            Array.isArray(response.breakpoints) &&
            response.breakpoints.every(
                (bp: any) => typeof bp === 'object' && bp !== null && typeof bp.verified === 'boolean'
            )
        );
    }
}
