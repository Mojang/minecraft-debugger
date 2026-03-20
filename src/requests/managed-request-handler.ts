// Copyright (C) Microsoft Corporation.  All rights reserved.

import * as vscode from 'vscode';
import { ManagedRequestArguments } from './managed-request-schema';

export interface ManagedRequestResultMessage {
    type: 'managed-request-result';
    request: string;
    status: 'ok' | 'error';
    response?: unknown;
    error?: string;
}

// Sends requests to the debug session and posts results back to the webview.
export class ManagedRequestHandler {
    private readonly _webview: vscode.Webview;

    public constructor(webview: vscode.Webview) {
        this._webview = webview;
    }
    
    public async handleManagedRequest(request: string, args?: unknown): Promise<void> {
        const session = vscode.debug.activeDebugSession;
        if (!session) {
            this._webview.postMessage({
                type: 'managed-request-result',
                request,
                status: 'error',
                error: 'No active debug session',
            });
            return;
        }

        const requestArgs: ManagedRequestArguments = {
            request,
            args,
        };

        await this.sendManagedRequestResult(session, request, requestArgs);
    }

    public async sendManagedRequestResult(
        session: vscode.DebugSession,
        request: string,
        requestArgs: ManagedRequestArguments,
    ): Promise<void> {
        try {
            // Send the request to the debug session and wait for a response
            const responsePayload = await session.customRequest('managed-request', requestArgs);
            
            this._webview.postMessage({
                type: 'managed-request-result',
                request,
                status: 'ok',
                response: responsePayload,
            });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);

            this._webview.postMessage({
                type: 'managed-request-result',
                request,
                status: 'error',
                error: errorMessage,
            });
        }
    }
}
