
// Copyright (C) Microsoft Corporation.  All rights reserved.

import React from 'react';
import { VSCodeButton, VSCodeTextField } from '@vscode/webview-ui-toolkit/react';
import { CaptureItem } from '../handlers/ProfilerHandlers';

interface ProfilerSectionProps {
    capturesBasePath: string;
    onCaptureBasePathBrowseButtonPressed: () => void;
    onCaptureBasePathEdited: (event: React.ChangeEvent<HTMLInputElement>) => void;
    scrollingListRef: React.RefObject<HTMLDivElement>;
    captureItems: CaptureItem[];
    selectedCaptureItem: CaptureItem | undefined;
    onSelectCaptureItem: (captureItem: CaptureItem) => void;
    onDeleteCaptureItem: (captureItem: CaptureItem) => void;
    onStartProfiler: () => void;
    onStopProfiler: () => void;
    isProfilerCapturing: boolean;
    supportsProfiler: boolean;
    debuggerConnected: boolean;
}

const ProfilerSection: React.FC<ProfilerSectionProps> = ({
    capturesBasePath,
    onCaptureBasePathBrowseButtonPressed,
    onCaptureBasePathEdited,
    scrollingListRef,
    captureItems,
    selectedCaptureItem,
    onSelectCaptureItem,
    onDeleteCaptureItem,
    onStartProfiler,
    onStopProfiler,
    isProfilerCapturing,
    supportsProfiler,
    debuggerConnected
}) => {
    return (
        <div className="section">
            <h3 className="title">Script Profiler</h3>
            <h4 className="sub-title">Captures Path</h4>
            <div className="capture-path-container">
                <VSCodeTextField
                    type="text"
                    value={capturesBasePath}
                    onChange={event =>
                        onCaptureBasePathEdited(event as React.ChangeEvent<HTMLInputElement>)
                    }
                    className="capture-path-input"
                />
                <VSCodeButton className="browse-button" onClick={onCaptureBasePathBrowseButtonPressed}>
                    Browse
                </VSCodeButton>
            </div>
            <div className="profiler-button-container">
                <VSCodeButton
                    className="profiler-button"
                    onClick={isProfilerCapturing ? onStopProfiler : onStartProfiler}
                    disabled={!debuggerConnected || !supportsProfiler || capturesBasePath === ''}
                >
                    {isProfilerCapturing ? "Stop Profiler" : "Start Profiler"}
                </VSCodeButton>
                <div className={`profiler-spinner ${isProfilerCapturing ? "profiler-spinner-spinning" : ""}`}></div>
            </div>
            <h4 className={`sub-title ${captureItems.length === 0 ? 'hidden' : ''}`}>Captures</h4>
            <div
                className={`capture-scrolling-list-box ${captureItems.length === 0 ? 'hidden' : ''}`}
                ref={scrollingListRef}
            >
                {captureItems.map(captureItem => (
                    <div
                        key={captureItem.fileName}
                        className={`capture-item ${selectedCaptureItem?.fileName === captureItem.fileName ? 'capture-item-selected' : ''}`}
                        onClick={() => onSelectCaptureItem(captureItem)}
                    >
                        <span>
                            {captureItem.fileName}
                        </span>
                        <button
                            className="capture-item-delete-button"
                            onClick={(event) => {
                                event.stopPropagation();
                                onDeleteCaptureItem(captureItem)
                            }}
                        >
                            Delete
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default ProfilerSection;
