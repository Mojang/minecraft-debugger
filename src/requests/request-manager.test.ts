// Copyright (C) Microsoft Corporation.  All rights reserved.

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import type { DebugProtocol } from '@vscode/debugprotocol';
import { RequestManager } from './request-manager';
import type { IDebuggeeMessageSender } from '../debuggee-message-sender';

describe('RequestManager', () => {
    let manager: RequestManager;
    let mockSender: IDebuggeeMessageSender;

    beforeEach(() => {
        mockSender = {
            sendDebuggeeMessage: vi.fn(),
            sendDebugeeRequestAsync: vi.fn(),
        } as unknown as IDebuggeeMessageSender;
    });

    describe('sendDebuggerRequest', () => {
        it('should send request envelope and resolve on successful response', async () => {
            manager = new RequestManager(mockSender);
            const response = { request_seq: 42 } as DebugProtocol.Response;

            const promise = manager.sendDebuggerRequest(response, {
                request: 'test-debugger-request',
                args: { foo: 'bar' },
            });

            const handled = manager.handleDebuggeeResponse({
                type: 'debuggee-response',
                request_seq: 42,
                success: true,
                args: { ok: true },
            });

            expect(mockSender.sendDebuggeeMessage as Mock).toHaveBeenCalledTimes(1);
            expect(mockSender.sendDebuggeeMessage as Mock).toHaveBeenNthCalledWith(1, {
                type: 'debugger-request',
                request: {
                    request_seq: 42,
                    request: 'test-debugger-request',
                    args: { foo: 'bar' },
                },
            });
            expect(handled).toBe(true);
            await expect(promise).resolves.toEqual({
                type: 'debuggee-response',
                request_seq: 42,
                success: true,
                args: { ok: true },
            });
        });

        it('should time out when no response is received', async () => {
            vi.useFakeTimers();
            manager = new RequestManager(mockSender);
            const response = { request_seq: 123 } as DebugProtocol.Response;

            const promise = manager.sendDebuggerRequest(response, {
                request: 'test-debugger-request',
            });
            const rejection = expect(promise).rejects.toThrow(
                "Debugger request 'test-debugger-request' timed out after 10000ms.",
            );
            await vi.advanceTimersByTimeAsync(10000);

            await rejection;
            vi.useRealTimers();
        });
    });

    describe('handleDebuggeeResponse', () => {
        it('should reject request on failed response', async () => {
            manager = new RequestManager(mockSender);
            const response = { request_seq: 7 } as DebugProtocol.Response;
            const promise = manager.sendDebuggerRequest(response, {
                request: 'test-debugger-request',
            });

            manager.handleDebuggeeResponse({
                type: 'debuggee-response',
                request_seq: 7,
                success: false,
                response_message: 'Denied',
            });

            await expect(promise).rejects.toThrow('Denied');
        });

        it('should return false for unknown response sequence', () => {
            manager = new RequestManager(mockSender);

            const handled = manager.handleDebuggeeResponse({
                type: 'debuggee-response',
                request_seq: -1,
                success: true,
            });

            expect(handled).toBe(false);
        });
    });

    describe('rejectPendingRequests', () => {
        it('should reject all pending requests when session disconnects', async () => {
            manager = new RequestManager(mockSender);
            const responseA = { request_seq: 1 } as DebugProtocol.Response;
            const responseB = { request_seq: 2 } as DebugProtocol.Response;

            const promiseA = manager.sendDebuggerRequest(responseA, { request: 'A' });
            const promiseB = manager.sendDebuggerRequest(responseB, { request: 'B' });

            manager.rejectPendingRequests('Disconnected');

            await expect(promiseA).rejects.toThrow('Disconnected');
            await expect(promiseB).rejects.toThrow('Disconnected');
        });
    });
});
