// Copyright (C) Microsoft Corporation.  All rights reserved.

// Sent from the webview to the debug session
export interface DebuggerRequestArguments {
    request: string;
    args?: unknown;
}