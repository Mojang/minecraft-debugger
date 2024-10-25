
// Copyright (C) Microsoft Corporation.  All rights reserved.

import { useEffect, useState } from 'react';
import CommandSection from './controls/CommandSection';
import { CommandButton, CommandHandlers, getCommandHandlers } from './handlers/CommandHandlers';
import DiagnosticSection from './controls/DiagnosticsSection';
import ProfilerSection from './controls/ProfilerSection';
import { CaptureItem, ProfilerHandlers, getProfilerHandlers } from './handlers/ProfilerHandlers';
import StatusSection from './controls/StatusSection';
import { WebviewApi } from 'vscode-webview';
import AutoReloadSelection from './controls/AutoReloadSelection';
import { AutoReloadHandlers, useAutoReloadHandlers } from './handlers/AutoReloadHandlers';
import './App.css';

interface SaveState {
    commandButtons: CommandButton[];
    capturesBasePath: string;
    autoReloadGlobPattern: string;
    autoReloadDelay: number;
}

const vscode: WebviewApi<unknown> = acquireVsCodeApi();

const onShowDiagnosticsPanel = () => {
    vscode.postMessage({ type: 'show-diagnostics' });
};

const onStartAutoReload = (globPattern: string, delay: number) => {
    vscode.postMessage({ type: 'start-auto-reload', globPattern: globPattern, delay: delay });
};

const onStopAutoReload = () => {
    vscode.postMessage({ type: 'stop-auto-reload' });
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
        autoReloadGlobPattern,
        autoReloadDelay,
        isAutoReloadActive,
        setAutoReloadGlobPattern,
        setAutoReloadDelay,
        setAutoReloadActive,
    }: AutoReloadHandlers = useAutoReloadHandlers();

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

        const state = (vscode.getState() as SaveState) || {
            commandButtons: [],
            capturesPath: '',
            autoReloadGlobPattern: '*/**',
            autoReloadDelay: 250,
        };

        if (state) {
            if (state.commandButtons) {
                setCommandButtons(state.commandButtons);
            }
            if (state.capturesBasePath) {
                setCapturesBasePath(state.capturesBasePath);
            }
            if (state.autoReloadGlobPattern) {
                setAutoReloadGlobPattern(state.autoReloadGlobPattern);
            }
            if (state.autoReloadDelay) {
                setAutoReloadDelay(state.autoReloadDelay);
            }
        }
    }, []);

    // save state
    useEffect(() => {
        vscode.setState({
            commandButtons: commandButtons,
            capturesBasePath: capturesBasePath,
            autoReloadGlobPattern: autoReloadGlobPattern,
            autoReloadDelay: autoReloadDelay
        });
    }, [commandButtons, capturesBasePath, autoReloadGlobPattern, autoReloadDelay]);

    // events from vscode
    useEffect(() => {
        vscode.postMessage({ type: 'request-debugger-status' });

        const handleMessage = (event: MessageEvent) => {
            const message = event.data;
            switch (message.type) {
                case 'captures-base-path-set':
                    setCapturesBasePath(message.capturesBasePath);
                    break;

                case 'capture-files-refreshed':
                    const sortedCaptureItems = message.allCaptureFileNames
                        .map((fileName: string) => ({ fileName }))
                        .sort((a: CaptureItem, b: CaptureItem) => b.fileName.localeCompare(a.fileName));
                    setCaptureItems(sortedCaptureItems);
                    if (message.newCaptureFileName) {
                        setSelectedCaptureItem({ fileName: message.newCaptureFileName });
                    }
                    break;

                case 'debugger-status':
                    if (!message.isConnected) {
                        setProfilerCapturing(false);
                    }
                    setDebuggerConnected(message.isConnected);
                    setSupportsCommands(message.supportsCommands);
                    setSupportsProfiler(message.supportsProfiler);
                    break;

                case 'auto-Reload-file-watcher-status':
                    setAutoReloadActive(message.isActive);
                    break;
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

            <AutoReloadSelection
                setAutoReloadActive={setAutoReloadActive}
                onStartAutoReload={onStartAutoReload}
                onStopAutoReload={onStopAutoReload}
                setAutoReloadDelay={setAutoReloadDelay}
                setAutoReloadGlobPattern={setAutoReloadGlobPattern}
                globPattern={autoReloadGlobPattern}
                delay={autoReloadDelay}
                isAutoReloadActive={isAutoReloadActive}
                isSupported={supportsCommands}
            />
        </main>
    );
};

export default App;
