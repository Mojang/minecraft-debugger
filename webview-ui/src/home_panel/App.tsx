// Copyright (C) Microsoft Corporation.  All rights reserved.

import { useEffect, useState } from 'react';
import CommandSection from './controls/CommandSection';
import { CommandButton, CommandHandlers, getCommandHandlers } from './handlers/CommandHandlers';
import GeneralSection from './controls/GeneralSection';
import ProfilerSection from './controls/ProfilerSection';
import { CaptureItem, ProfilerHandlers, getProfilerHandlers } from './handlers/ProfilerHandlers';
import McpSection, { ActivityEntry, McpServerState } from './controls/McpSection';
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

const onOpenDiagnosticsReplay = () => {
    vscode.postMessage({ type: 'open-diagnostics-replay' });
};

const onShowSettings = () => {
    vscode.postMessage({ type: 'show-settings' });
};

const onRunCommand = (command: string) => {
    vscode.postMessage({ type: 'run-minecraft-command', command: command });
};

const onCaptureBasePathBrowseButtonPressed = () => {
    vscode.postMessage({ type: 'browse-captures-base-path' });
};

const onCopyMcpConfig = () => {
    vscode.postMessage({ type: 'copy-mcp-config' });
};

const onShowMcpSettings = () => {
    vscode.postMessage({ type: 'show-mcp-settings' });
};

const App = () => {
    const [debuggerConnected, setDebuggerConnected] = useState<boolean>(false);
    const [debuggerListening, setDebuggerListening] = useState<boolean>(false);
    const [supportsCommands, setSupportsCommands] = useState<boolean>(false);
    const [supportsProfiler, setSupportsProfiler] = useState<boolean>(false);

    const [mcpEntries, setMcpEntries] = useState<ActivityEntry[]>([]);
    const [mcpState, setMcpState] = useState<McpServerState>({ state: 'off', clientActive: false });

    const { commandButtons, setCommandButtons, onAddCommand, onDeleteCommand, onEditCommand }: CommandHandlers =
        getCommandHandlers();

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
        onStopProfiler,
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
            capturesBasePath: capturesBasePath,
        });
    }, [commandButtons, capturesBasePath]);

    // events from vscode
    useEffect(() => {
        vscode.postMessage({ type: 'request-debugger-status' });
        vscode.postMessage({ type: 'request-mcp-status' });

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
                setDebuggerListening(message.isListening);
                setSupportsCommands(message.supportsCommands);
                setSupportsProfiler(message.supportsProfiler);
            } else if (message.type === 'mcp-replay') {
                // store sends entries oldest-first; reverse for newest-first display
                setMcpEntries([...(message.entries as ActivityEntry[])].reverse().slice(0, 200));
                setMcpState(message.state);
            } else if (message.type === 'mcp-activity') {
                const entry = message.entry as ActivityEntry;
                setMcpEntries(prev =>
                    prev.some(e => e.id === entry.id)
                        ? prev.map(e => (e.id === entry.id ? entry : e))
                        : [entry, ...prev].slice(0, 200),
                );
            } else if (message.type === 'mcp-state') {
                setMcpState(message.state);
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
            <StatusSection debuggerConnected={debuggerConnected} debuggerListening={debuggerListening} />
            <GeneralSection
                onShowDiagnosticsPanel={onShowDiagnosticsPanel}
                onOpenDiagnosticsReplay={onOpenDiagnosticsReplay}
                onShowSettings={onShowSettings}
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
            <McpSection
                entries={mcpEntries}
                serverState={mcpState}
                onCopyConfig={onCopyMcpConfig}
                onShowSettings={onShowMcpSettings}
            />
        </main>
    );
};

export default App;
