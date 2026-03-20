// Copyright (C) Microsoft Corporation.  All rights reserved.

// Sent from the webview to the debug session
export interface ManagedRequestArguments {
    request: string;
    args?: unknown;
}

// Sent from the debug session to the debuggee (MC)
export interface ManagedRequestEnvelope {
    type: 'managed-request';
    request: {
        request_seq: number;
        request: string;
        args?: unknown;
    };
}

// Received from the debuggee (MC) in response to a ManagedRequestEnvelope
export interface ManagedResponseEnvelope {
    type: 'managed-response';
    request_seq: number;
    args?: unknown;
    success?: boolean;
    response_message?: string;
}
