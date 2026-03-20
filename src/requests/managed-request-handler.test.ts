// Copyright (C) Microsoft Corporation.  All rights reserved.

import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('vscode', () => ({
    debug: {
        activeDebugSession: undefined,
    },
}));

import * as vscode from 'vscode';
import { ManagedRequestHandler } from './managed-request-handler';

describe('ManagedRequestHandler', () => {
    let handler: ManagedRequestHandler;
    let postMessage: Mock;

    beforeEach(() => {
        postMessage = vi.fn();
        const webview = { postMessage } as unknown as vscode.Webview;
        handler = new ManagedRequestHandler(webview);
        (vscode.debug as { activeDebugSession?: vscode.DebugSession }).activeDebugSession = undefined;
    });

    describe('handleManagedRequest', () => {
        it('should post error result when no active debug session exists', async () => {
            const request = 'test-request';

            await handler.handleManagedRequest(request);

            expect(postMessage).toHaveBeenCalledTimes(1);
            expect(postMessage).toHaveBeenNthCalledWith(1, {
                type: 'managed-request-result',
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

            await handler.handleManagedRequest(request, args);

            expect(customRequest).toHaveBeenCalledTimes(1);
            expect(customRequest).toHaveBeenNthCalledWith(1, 'managed-request', {
                request,
                args,
            });
            expect(postMessage).toHaveBeenCalledTimes(1);
            expect(postMessage).toHaveBeenNthCalledWith(1, {
                type: 'managed-request-result',
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

            await handler.handleManagedRequest(request, { value: 2 });

            expect(customRequest).toHaveBeenCalledTimes(1);
            expect(postMessage).toHaveBeenCalledTimes(1);
            expect(postMessage).toHaveBeenNthCalledWith(1, {
                type: 'managed-request-result',
                request,
                status: 'error',
                error: 'Denied',
            });
        });
    });
});
