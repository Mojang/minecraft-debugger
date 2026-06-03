// Copyright (C) Microsoft Corporation.  All rights reserved.

import { DebugProtocol } from '@vscode/debugprotocol';
import { OutgoingDebuggeeMessage } from './protocol-events';

// Interface for sending debugger messages and requests to MC
export interface IDebuggeeMessageSender {
    sendDebuggeeMessage(envelope: OutgoingDebuggeeMessage): void;
    sendDebugeeRequestAsync(response: DebugProtocol.Response, args: unknown): Promise<unknown>;
}
