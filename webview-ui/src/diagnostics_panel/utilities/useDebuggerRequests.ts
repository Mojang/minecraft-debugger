// Copyright (C) Microsoft Corporation.  All rights reserved.

import { useCallback, useState } from 'react';
import { vscode } from './vscode';

// Result payload posted back from the extension host after a debugger request completes.
export type DebuggerRequestResultMessage = {
    type: 'debugger-request-result';
    request: string;
    status: 'ok' | 'error';
    response?: unknown;
    error?: string;
};

export type UseDebuggerRequestsResult = {
     // Sends a debugger request to the extension host.
     // Duplicate requests with the same `request` string are ignored while one is in-flight.
    onDebuggerRequest: (request: string, args?: unknown) => void;

    // Returns true if a request with the given request key is currently in progress.
    isDebuggerRequestInFlight: (request: string) => boolean;

    // Returns the latest result message for a given request key.
    getDebuggerRequestResult: (request: string) => unknown;

    // Accepts an incoming result message of type `debugger-request-result` and updates results.
    handleDebuggerRequestResult: (message: DebuggerRequestResultMessage) => void;
};

// Custom hook to manage sending requests to the debug session and tracking their results.
//
// Expected usage:
//   1. Call `onDebuggerRequest` to send a request to the extension host.
//   2. Pass incoming messages of type `debugger-request-result` to `handleDebuggerRequestResult` to update the request results and in-flight status.
//   3. Use `isDebuggerRequestInFlight` and `getDebuggerRequestResult` to access the status and result of requests.
export function useDebuggerRequests(): UseDebuggerRequestsResult {
    // Track the status of ongoing debugger requests
    const [inFlightDebuggerRequests, setInFlightDebuggerRequests] = useState<Set<string>>(new Set());

    // Stores the most recent result of each debugger request, keyed by the request string
    const [debuggerRequestResults, setDebuggerRequestResults] = useState<Map<string, DebuggerRequestResultMessage>>(
        new Map(),
    );

    const onDebuggerRequest = useCallback(
        (request: string, args?: unknown) => {
            if (inFlightDebuggerRequests.has(request)) {
                // Already a request of this type in-flight, ignore this new request to prevent duplicates
                return;
            }

            setInFlightDebuggerRequests(previousRequests => {
                const updatedRequests = new Set(previousRequests);
                updatedRequests.add(request);
                return updatedRequests;
            });

            // Sends the request to the extension host
            vscode.postMessage({
                type: 'debugger-request',
                request,
                args,
            });
        },
        [inFlightDebuggerRequests],
    );

    const isDebuggerRequestInFlight = useCallback(
        (request: string): boolean => inFlightDebuggerRequests.has(request),
        [inFlightDebuggerRequests],
    );

    const getDebuggerRequestResult = useCallback(
        (request: string): unknown => debuggerRequestResults.get(request),
        [debuggerRequestResults],
    );

    const handleDebuggerRequestResult = useCallback((message: DebuggerRequestResultMessage): void => {
        setDebuggerRequestResults(previousResults => {
            const updatedResults = new Map(previousResults);
            updatedResults.set(message.request, message);
            return updatedResults;
        });

        setInFlightDebuggerRequests(previousRequests => {
            if (!previousRequests.has(message.request)) {
                return previousRequests;
            }

            const updatedRequests = new Set(previousRequests);
            updatedRequests.delete(message.request);
            return updatedRequests;
        });
    }, []);

    return {
        onDebuggerRequest,
        isDebuggerRequestInFlight,
        getDebuggerRequestResult,
        handleDebuggerRequestResult,
    };
}
