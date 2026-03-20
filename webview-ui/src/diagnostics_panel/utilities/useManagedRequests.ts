// Copyright (C) Microsoft Corporation.  All rights reserved.

import { useCallback, useState } from 'react';
import { vscode } from './vscode';

type ManagedRequestResultMessage = {
    type: 'managed-request-result';
    request: string;
    status: 'ok' | 'error';
    response?: unknown;
    error?: string;
};

type UseManagedRequestsResult = {
    onManagedRequest: (request: string, args?: unknown) => void;
    isManagedRequestInFlight: (request: string) => boolean;
    getManagedRequestResult: (request: string) => unknown;
    handleManagedRequestResult: (message: ManagedRequestResultMessage) => void;
};

export function useManagedRequests(): UseManagedRequestsResult {
    // Track the status of ongoing managed requests
    const [inFlightManagedRequests, setInFlightManagedRequests] = useState<Set<string>>(new Set());

    // Stores the most recent result of each managed request, keyed by the request string
    const [managedRequestResults, setManagedRequestResults] = useState<Map<string, ManagedRequestResultMessage>>(
        new Map(),
    );

    const onManagedRequest = useCallback(
        (request: string, args?: unknown) => {
            if (inFlightManagedRequests.has(request)) {
                // Already a request of this type in-flight, ignore this new request to prevent duplicates
                return;
            }

            setInFlightManagedRequests(previousRequests => {
                const updatedRequests = new Set(previousRequests);
                updatedRequests.add(request);
                return updatedRequests;
            });

            // Sends the request to the extension host
            vscode.postMessage({
                type: 'managed-request',
                request,
                args,
            });
        },
        [inFlightManagedRequests],
    );

    const isManagedRequestInFlight = useCallback(
        (request: string): boolean => inFlightManagedRequests.has(request),
        [inFlightManagedRequests],
    );

    const getManagedRequestResult = useCallback(
        (request: string): unknown => managedRequestResults.get(request),
        [managedRequestResults],
    );

    const handleManagedRequestResult = useCallback((message: ManagedRequestResultMessage): void => {
        setManagedRequestResults(previousResults => {
            const updatedResults = new Map(previousResults);
            updatedResults.set(message.request, message);
            return updatedResults;
        });

        setInFlightManagedRequests(previousRequests => {
            if (!previousRequests.has(message.request)) {
                return previousRequests;
            }

            const updatedRequests = new Set(previousRequests);
            updatedRequests.delete(message.request);
            return updatedRequests;
        });
    }, []);

    return {
        onManagedRequest,
        isManagedRequestInFlight,
        getManagedRequestResult,
        handleManagedRequestResult,
    };
}
