// Copyright (C) Microsoft Corporation.  All rights reserved.

import { useEffect, useState } from 'react';
import type { DebuggeeResponseEnvelope } from '../../../../src/protocol-events';
import { vscode } from './vscode';

// Result payload posted back from the extension host after a debugger request completes.
export type DebuggerRequestResultMessage = {
    type: 'debugger-request-result';
    request: string;
    status: 'ok' | 'error';
    response?: DebuggeeResponseEnvelope;
    error?: string;
};

export enum DebuggerRequestTarget {
    Client = 'client',
    Server = 'server',
}

const InFlightDebuggerRequests = new Map<string, DebuggerRequestTarget | undefined>();
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

function getDebuggerRequestTarget(request: string, args: unknown): DebuggerRequestTarget | undefined{
    if (typeof args === 'object' && args !== null && 'target' in args) {
        if (args.target !== DebuggerRequestTarget.Client && args.target !== DebuggerRequestTarget.Server) {
            console.warn(`Invalid target for debugger request '${request}':`, args.target);
            return undefined;
        }
        return args.target;
    }
    return undefined;
}

// Sends a debugger request to the extension host.
// Duplicate requests with the same `request` string are ignored if one is in-flight.
export function sendDebuggerRequest(request: string, args?: unknown): void {
    if (InFlightDebuggerRequests.has(request)) {
        console.warn(`Request '${request}' is already in-flight. Ignoring duplicate request.`);
        return;
    }

    const target = getDebuggerRequestTarget(request, args);
    InFlightDebuggerRequests.set(request, target);
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

// Returns the latest result message for a given request and optional target.
export function getDebuggerRequestResult(
    request: string,
    target?: DebuggerRequestTarget,
): DebuggerRequestResultMessage | undefined {
    return DebuggerRequestResults.get(JSON.stringify([request, target]));
}

// Accepts an incoming result message of type `debugger-request-result` and updates results.
export function handleDebuggerRequestResult(message: DebuggerRequestResultMessage): void {
    const target = InFlightDebuggerRequests.get(message.request);
    DebuggerRequestResults.set(JSON.stringify([message.request, target]), message);
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
