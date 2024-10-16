
// Copyright (C) Microsoft Corporation.  All rights reserved.

import { useCallback, useEffect, useRef, useState } from 'react';
import { WebviewApi } from 'vscode-webview';

export interface CaptureItem {
    fileName: string;
}

export interface ProfilerHandlers {
    // state
    scrollingListRef: React.RefObject<HTMLDivElement>;
    capturesBasePath: string;
    setCapturesBasePath: (basePath: string) => void;
    isProfilerCapturing: boolean;
    setProfilerCapturing: (isCapturing: boolean) => void;
    captureItems: CaptureItem[];
    setCaptureItems: (items: CaptureItem[]) => void;
    selectedCaptureItem: CaptureItem | undefined;
    setSelectedCaptureItem: (item: CaptureItem | undefined) => void;
    // callbacks
    onCaptureBasePathEdited: (event: React.ChangeEvent<HTMLInputElement>) => void;
    onSelectCaptureItem: (captureItem: CaptureItem) => void;
    onDeleteCaptureItem: (toDelete: CaptureItem) => void;
    onStartProfiler: () => void;
    onStopProfiler: () => void;
}

export const getProfilerHandlers = (vscode: WebviewApi<unknown>): ProfilerHandlers => {

    const scrollingListRef = useRef<HTMLDivElement>(null);
    const [capturesBasePath, setCapturesBasePath] = useState<string>('');
    const [isProfilerCapturing, setProfilerCapturing] = useState(false);
    const [captureItems, setCaptureItems] = useState<CaptureItem[]>([]);
    const [selectedCaptureItem, setSelectedCaptureItem] = useState<CaptureItem | undefined>(undefined);

    // watch for changes to the capture path
    useEffect(() => {
        setCaptureItems([]);
        vscode.postMessage({ type: 'refresh-captures', capturesBasePath: capturesBasePath });
    }, [capturesBasePath]);

    // update the scrolling list when captures are refreshed
    useEffect(() => {
        if (scrollingListRef.current) {
            scrollingListRef.current.scrollTop = 0;
        }
    }, [captureItems]);

    // handle change in save path, manual or from file picker dialog
    const onCaptureBasePathEdited = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        setCapturesBasePath(event.target.value);
    }, []);

    // when a capture file is selected from the list
    const onSelectCaptureItem = useCallback((captureItem: CaptureItem) => {
        setSelectedCaptureItem(captureItem);
        vscode.postMessage({
            type: 'open-capture-file',
            capturesBasePath: capturesBasePath,
            fileName: captureItem.fileName
        });
    }, [capturesBasePath]);

    // delete a capture file
    const onDeleteCaptureItem = useCallback((toDelete: CaptureItem) => {
        setCaptureItems(prevItems => prevItems.filter(item => item.fileName !== toDelete.fileName));
        if (selectedCaptureItem?.fileName === toDelete.fileName) {
            setSelectedCaptureItem(undefined);
        }
        vscode.postMessage({
            type: 'delete-capture-file',
            capturesBasePath: capturesBasePath,
            fileName: toDelete.fileName
        });
    }, [capturesBasePath, selectedCaptureItem]);

    // send start profiler event to MC
    const onStartProfiler = useCallback(() => {
        setProfilerCapturing(true);
        vscode.postMessage({ type: 'start-profiler' });
    }, []);

    // send stop profiler event to MC
    const onStopProfiler = useCallback(() => {
        setProfilerCapturing(false);
        vscode.postMessage({ type: 'stop-profiler', capturesBasePath: capturesBasePath });
    }, [capturesBasePath]);

    return {
        scrollingListRef,
        capturesBasePath,
        setCapturesBasePath,
        isProfilerCapturing,
        setProfilerCapturing,
        captureItems,
        setCaptureItems,
        selectedCaptureItem,
        setSelectedCaptureItem,
        onCaptureBasePathEdited,
        onSelectCaptureItem,
        onDeleteCaptureItem,
        onStartProfiler,
        onStopProfiler
    };
};
