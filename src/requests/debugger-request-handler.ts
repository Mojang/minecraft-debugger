// Copyright (C) Microsoft Corporation.  All rights reserved.

import * as vscode from 'vscode';
import { DebuggerRequestArguments } from './debugger-request-schema';

// Sends requests to the debug session and posts results back to the webview.
export class DebuggerRequestHandler {
    private readonly _webview: vscode.Webview;

    public constructor(webview: vscode.Webview) {
        this._webview = webview;
    }
    
    public async handleDebuggerRequest(request: string, args?: unknown): Promise<void> {
        const session = vscode.debug.activeDebugSession;
        if (!session) {
            this._webview.postMessage({
                type: 'debugger-request-result',
                request,
                status: 'error',
                error: 'No active debug session',
            });
            return;
        }

        const requestArgs: DebuggerRequestArguments = {
            request,
            args,
        };

        await this.sendDebuggerRequestResult(session, request, requestArgs);
    }

    public async sendDebuggerRequestResult(
        session: vscode.DebugSession,
        request: string,
        requestArgs: DebuggerRequestArguments,
    ): Promise<void> {
        try {
            // Send the request to the debug session and wait for a response
            const responsePayload = await session.customRequest('debugger-request', requestArgs);
            
            this._webview.postMessage({
                type: 'debugger-request-result',
                request,
                status: 'ok',
                response: responsePayload,
            });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);

            this._webview.postMessage({
                type: 'debugger-request-result',
                request,
                status: 'error',
                error: errorMessage,
            });
        }
    }
}
