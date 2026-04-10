// Copyright (C) Microsoft Corporation.  All rights reserved.

import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('vscode', () => ({
    debug: {
        activeDebugSession: undefined,
    },
}));

import * as vscode from 'vscode';
import { DebuggerRequestHandler } from './debugger-request-handler';

describe('DebuggerRequestHandler', () => {
    let handler: DebuggerRequestHandler;
    let postMessage: Mock;

    beforeEach(() => {
        postMessage = vi.fn();
        const webview = { postMessage } as unknown as vscode.Webview;
        handler = new DebuggerRequestHandler(webview);
        (vscode.debug as { activeDebugSession?: vscode.DebugSession }).activeDebugSession = undefined;
    });

    describe('handleDebuggerRequest', () => {
        it('should post error result when no active debug session exists', async () => {
            const request = 'test-request';

            await handler.handleDebuggerRequest(request);

            expect(postMessage).toHaveBeenCalledTimes(1);
            expect(postMessage).toHaveBeenNthCalledWith(1, {
                type: 'debugger-request-result',
                request,
                status: 'error',
                error: 'No active debug session',
            });
        });

        it('should post success result when custom request resolves', async () => {
            const request = 'test-request';
            const args = { value: 1 };
            const responsePayload = { ok: true };
            const customRequest = vi.fn().mockResolvedValue(responsePayload);
            (vscode.debug as { activeDebugSession?: vscode.DebugSession }).activeDebugSession = {
                customRequest,
            } as unknown as vscode.DebugSession;

            await handler.handleDebuggerRequest(request, args);

            expect(customRequest).toHaveBeenCalledTimes(1);
            expect(customRequest).toHaveBeenNthCalledWith(1, 'debugger-request', {
                request,
                args,
            });
            expect(postMessage).toHaveBeenCalledTimes(1);
            expect(postMessage).toHaveBeenNthCalledWith(1, {
                type: 'debugger-request-result',
                request,
                status: 'ok',
                response: responsePayload,
            });
        });

        it('should post error result when custom request rejects', async () => {
            const request = 'test-request';
            const rejection = new Error('Denied');
            const customRequest = vi.fn().mockRejectedValue(rejection);
            (vscode.debug as { activeDebugSession?: vscode.DebugSession }).activeDebugSession = {
                customRequest,
            } as unknown as vscode.DebugSession;

            await handler.handleDebuggerRequest(request, { value: 2 });

            expect(customRequest).toHaveBeenCalledTimes(1);
            expect(postMessage).toHaveBeenCalledTimes(1);
            expect(postMessage).toHaveBeenNthCalledWith(1, {
                type: 'debugger-request-result',
                request,
                status: 'error',
                error: 'Denied',
            });
        });
    });
});
