
// Copyright (C) Microsoft Corporation.  All rights reserved.

import { useEffect, useRef, useState } from 'react';
import CommandSection from './controls/CommandSection'
import { CommandButton, CommandHandlers, getCommandHandlers } from './handlers/CommandHandlers';
import DiagnosticSection from './controls/DiagnosticsSection';
import ProfilerSection from './controls/ProfilerSection';
import { CaptureItem, ProfilerHandlers, getProfilerHandlers } from './handlers/ProfilerHandlers';
import StatusSection from './controls/StatusSection';
import { WebviewApi } from 'vscode-webview';
import './App.css';

interface SaveState {
    commandButtons: CommandButton[];
    capturesBasePath: string;
}

const vscode: WebviewApi<unknown> = acquireVsCodeApi();

const onShowDiagnosticsPanel = () => {
    vscode.postMessage({ type: 'show-diagnostics' });
};

const onRunCommand = (command: string) => {
    vscode.postMessage({ type: 'run-minecraft-command', command: command });
};

const onCaptureBasePathBrowseButtonPressed = () => {
    vscode.postMessage({ type: 'browse-captures-base-path' });
};

const App = () => {

    const [debuggerConnected, setDebuggerConnected] = useState<boolean>(false);
    const [supportsCommands, setSupportsCommands] = useState<boolean>(false);
    const [supportsProfiler, setSupportsProfiler] = useState<boolean>(false);

    const {
        commandButtons,
        setCommandButtons,
        onAddCommand,
        onDeleteCommand,
        onEditCommand
     }: CommandHandlers = getCommandHandlers();

     const {
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
     }: ProfilerHandlers = getProfilerHandlers(vscode);

    // load state
    useEffect(() => {
        const state = (vscode.getState() as SaveState) || { commandButtons: [], capturesPath: '' };
        if (state) {
            if (state.commandButtons) {
                setCommandButtons(state.commandButtons);
            }
            if (state.capturesBasePath) {
                setCapturesBasePath(state.capturesBasePath);
            }
        }
    }, []);

    // save state
    useEffect(() => {
        vscode.setState({
            commandButtons: commandButtons,
            capturesBasePath: capturesBasePath
        });
    }, [commandButtons, capturesBasePath]);

    // events from vscode
    useEffect(() => {
        vscode.postMessage({ type: 'request-debugger-status' });

        const handleMessage = (event: MessageEvent) => {
            const message = event.data;
            if (message.type === 'captures-base-path-set') {
                setCapturesBasePath(message.capturesBasePath);
            } else if (message.type === 'capture-files-refreshed') {
                const sortedCaptureItems = message.allCaptureFileNames
                    .map((fileName: string) => ({ fileName }))
                    .sort((a: CaptureItem, b: CaptureItem) => b.fileName.localeCompare(a.fileName));
                setCaptureItems(sortedCaptureItems);
                if (message.newCaptureFileName) {
                    setSelectedCaptureItem({ fileName: message.newCaptureFileName });
                }
            } else if (message.type === 'debugger-status') {
                if (!message.isConnected) {
                    setProfilerCapturing(false);
                }
                setDebuggerConnected(message.isConnected);
                setSupportsCommands(message.supportsCommands);
                setSupportsProfiler(message.supportsProfiler);
            }
        };

        window.addEventListener('message', handleMessage);

        return () => {
            window.removeEventListener('message', handleMessage);
        };
    }, []);

    // Render
    return (
        <main>
            <StatusSection
                debuggerConnected={debuggerConnected}
            />
            <DiagnosticSection
                onShowDiagnosticsPanel={onShowDiagnosticsPanel}
            />
            <CommandSection
                debuggerConnected={debuggerConnected}
                supportsCommands={supportsCommands}
                commandButtons={commandButtons}
                onAddCommand={onAddCommand}
                onEditCommand={onEditCommand}
                onRunCommand={onRunCommand}
                onDeleteCommand={onDeleteCommand}
            />
            <ProfilerSection
                capturesBasePath={capturesBasePath}
                onCaptureBasePathBrowseButtonPressed={onCaptureBasePathBrowseButtonPressed}
                onCaptureBasePathEdited={onCaptureBasePathEdited}
                scrollingListRef={scrollingListRef}
                captureItems={captureItems}
                selectedCaptureItem={selectedCaptureItem}
                onSelectCaptureItem={onSelectCaptureItem}
                onDeleteCaptureItem={onDeleteCaptureItem}
                onStartProfiler={onStartProfiler}
                onStopProfiler={onStopProfiler}
                isProfilerCapturing={isProfilerCapturing}
                supportsProfiler={supportsProfiler}
                debuggerConnected={debuggerConnected}
            />
        </main>
    );
}

export default App;
