// Copyright (C) Microsoft Corporation.  All rights reserved.

import { useEffect, useState } from 'react';
import type { DebuggeeResponseEnvelope } from '../../../../src/requests/debugger-request-schema';
import { vscode } from './vscode';

// Result payload posted back from the extension host after a debugger request completes.
export type DebuggerRequestResultMessage = {
    type: 'debugger-request-result';
    request: string;
    status: 'ok' | 'error';
    response?: DebuggeeResponseEnvelope;
    error?: string;
};

const InFlightDebuggerRequests = new Set<string>();
const DebuggerRequestResults = new Map<string, DebuggerRequestResultMessage>();
const DebuggerRequestListeners = new Set<() => void>();

function notifyDebuggerRequestListeners(): void {
    for (const listener of DebuggerRequestListeners) {
        listener();
    }
}

function subscribeToDebuggerRequestUpdates(listener: () => void): () => void {
    DebuggerRequestListeners.add(listener);
    return () => {
        DebuggerRequestListeners.delete(listener);
    };
}

// Sends a debugger request to the extension host.
// Duplicate requests with the same `request` string are ignored if one is in-flight.
export function sendDebuggerRequest(request: string, args?: unknown): void {
    if (InFlightDebuggerRequests.has(request)) {
        console.warn(`Request '${request}' is already in-flight. Ignoring duplicate request.`);
        return;
    }

    InFlightDebuggerRequests.add(request);
    notifyDebuggerRequestListeners();

    vscode.postMessage({
        type: 'debugger-request',
        request,
        args,
    });
}

// Returns true if a request with the given request key is currently in progress.
export function isDebuggerRequestInFlight(request: string): boolean {
    return InFlightDebuggerRequests.has(request);
}

// Returns the latest result message for a given request key.
export function getDebuggerRequestResult(request: string): DebuggerRequestResultMessage | undefined {
    return DebuggerRequestResults.get(request);
}

// Accepts an incoming result message of type `debugger-request-result` and updates results.
export function handleDebuggerRequestResult(message: DebuggerRequestResultMessage): void {
    DebuggerRequestResults.set(message.request, message);
    InFlightDebuggerRequests.delete(message.request);
    notifyDebuggerRequestListeners();
}

// React convenience hook for tabs that want auto-refresh.
export function useDebuggerRequestUpdates(): void {
    const [, setRenderTick] = useState<number>(0);

    useEffect(() => {
        return subscribeToDebuggerRequestUpdates(() => {
            setRenderTick(currentTick => currentTick + 1);
        });
    }, []);
}
