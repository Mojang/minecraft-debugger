// Copyright (C) Microsoft Corporation.  All rights reserved.

import { useCallback, useState } from 'react';
import { vscode } from './vscode';

type DebuggerRequestResultMessage = {
    type: 'debugger-request-result';
    request: string;
    status: 'ok' | 'error';
    response?: unknown;
    error?: string;
};

type UseDebuggerRequestsResult = {
    onDebuggerRequest: (request: string, args?: unknown) => void;
    isDebuggerRequestInFlight: (request: string) => boolean;
    getDebuggerRequestResult: (request: string) => unknown;
    handleDebuggerRequestResult: (message: DebuggerRequestResultMessage) => void;
};

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
