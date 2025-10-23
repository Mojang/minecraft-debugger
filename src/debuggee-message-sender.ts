// Copyright (C) Microsoft Corporation.  All rights reserved.

import { DebugProtocol } from '@vscode/debugprotocol';

// Interface for sending debugger messages and requests to MC
export interface IDebuggeeMessageSender {
    sendDebuggeeMessage(envelope: unknown): void;
    sendDebugeeRequestAsync(response: DebugProtocol.Response, args: unknown): Promise<unknown>;
}
