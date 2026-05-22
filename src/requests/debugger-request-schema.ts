// Copyright (C) Microsoft Corporation.  All rights reserved.

// Sent from the webview to the debug session
export interface DebuggerRequestArguments {
    request: string;
    args?: unknown;
}

// Sent from the debug session to the debuggee (MC)
export interface DebuggerRequestEnvelope {
    type: 'debugger-request';
    request: {
        request_seq: number;
        request: string;
        args?: unknown;
    };
}

// Received from the debuggee (MC) in response to a DebuggerRequestEnvelope
export interface DebuggeeResponseEnvelope {
    type: 'debuggee-response';
    request_seq: number;
    args?: unknown;
    success?: boolean;
    response_message?: string;
}
