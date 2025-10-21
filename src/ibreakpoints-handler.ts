// Copyright (C) Microsoft Corporation.  All rights reserved.

import { DebugProtocol } from '@vscode/debugprotocol';

export interface IBreakpointsHandler {
    handleSetBreakpointsRequest(
        sourcePath: string,
        response: DebugProtocol.SetBreakpointsResponse,
        args: DebugProtocol.SetBreakpointsArguments
    ): Promise<any>;
}
