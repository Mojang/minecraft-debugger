// Copyright (C) Microsoft Corporation.  All rights reserved.

import { DebugProtocol } from '@vscode/debugprotocol';
import { ManagedRequestArguments, ManagedRequestEnvelope, ManagedResponseEnvelope } from './managed-request-schema';
import { IDebuggeeMessageSender } from '../debuggee-message-sender';

interface PendingManagedRequest {
    resolve: (value: unknown) => void;
    reject: (reason?: unknown) => void;
    timeout?: ReturnType<typeof setTimeout>;
}

export class RequestManager {
    private readonly _defaultManagedRequestTimeoutMs = 10000;
    private readonly _pendingRequests = new Map<number, PendingManagedRequest>();
    private readonly _sender: IDebuggeeMessageSender;

    public constructor(sender: IDebuggeeMessageSender) {
        this._sender = sender;
    }

    public sendManagedRequest(
        response: DebugProtocol.Response,
        managedRequestArgs: ManagedRequestArguments,
        timeoutMs: number = this._defaultManagedRequestTimeoutMs,
    ): Promise<unknown> {
        const { request, args } = managedRequestArgs;
        const seq = response.request_seq;

        return new Promise((resolve, reject) => {
            // Set a timeout to reject the promise if a response is not received within the specified time
            const timeout: ReturnType<typeof setTimeout> = setTimeout(() => {
                if (!this._pendingRequests.has(seq)) {
                    return;
                }

                this._pendingRequests.delete(seq);
                reject(new Error(`Managed request '${request}' timed out after ${timeoutMs}ms.`));
            }, timeoutMs);

            this._pendingRequests.set(seq, {
                resolve,
                reject,
                timeout,
            });

            // Create an envelope to hold the request, and send it to the debuggee
            const envelope: ManagedRequestEnvelope = {
                type: 'managed-request',
                request: {
                    request_seq: seq,
                    request,
                    args,
                },
            };

            this._sender.sendDebuggeeMessage(envelope);
        });
    }

    public handleManagedResponse(envelope: ManagedResponseEnvelope): boolean {
        const pending = this._pendingRequests.get(envelope.request_seq);
        if (!pending) {
            // Can happen if the request times out before a response is received
            return false;
        }

        // Remove the pending request from the map and clear its timeout
        this._pendingRequests.delete(envelope.request_seq);
        if (pending.timeout) {
            clearTimeout(pending.timeout);
        }
        
        if (!envelope.success) {
            pending.reject(new Error(envelope.response_message ?? 'Debuggee request failed.'));
        } else {
            pending.resolve(envelope);
        }

        return true;
    }

    public rejectPendingRequests(message: string): void {
        for (const pendingRequest of this._pendingRequests.values()) {
            if (pendingRequest.timeout) {
                clearTimeout(pendingRequest.timeout);
            }
            pendingRequest.reject(new Error(message));
        }

        this._pendingRequests.clear();
    }
}
