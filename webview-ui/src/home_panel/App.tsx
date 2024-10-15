
// Copyright (C) Microsoft Corporation.  All rights reserved.

import React, { useEffect, useCallback, useRef, useState } from 'react';
import CommandShortcutsSection, { CommandButton } from './controls/CommandShortcutsSection'
import DiagnosticSection from './controls/DiagnosticsSection';
import ProfilerSection, { CaptureItem } from './controls/ProfilerSection';
import StatusSection from './controls/StatusSection';
import './App.css';

const vscode = acquireVsCodeApi();

interface SaveState {
    commandButtons: CommandButton[];
    capturesBasePath: string;
}

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

    //-------------------------------------------------------------------------
    // Minecraft Commands
    //-------------------------------------------------------------------------

    // command list
    const [commandButtons, setCommandButtons] = useState<CommandButton[]>([]);

    // add to command list
    const onAddCommand = () => {
        setCommandButtons(prevButtons => {
            const newButton: CommandButton = {
                id: `${Date.now()}-${Math.random()}`,
                command: '',
            };
            const newButtons = [...prevButtons, newButton];
            return newButtons;
        });
    };

    // remove from command list
    const onDeleteCommand = (id: string) => {
        setCommandButtons(prevButtons => {
            const newButtons = prevButtons.filter(button => button.id !== id);
            return newButtons;
        });
    };

    // update text of a command
    const onEditCommand = (id: string, event: React.ChangeEvent<HTMLInputElement>) => {
        setCommandButtons(prevButtons => {
            return prevButtons.map(commandButton =>
                commandButton.id === id ? { ...commandButton, command: event.target.value } : commandButton
            );
        });
    };

    //-------------------------------------------------------------------------
    // Profiler
    //-------------------------------------------------------------------------

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
    const onCaptureBasePathEdited = (event: React.ChangeEvent<HTMLInputElement>) => {
        setCapturesBasePath(event.target.value);
    }

    // when a capture file is selected from the list
    const onSelectCaptureItem = (captureItem: CaptureItem) => {
        setSelectedCaptureItem(captureItem);
        vscode.postMessage({
            type: 'open-capture-file',
            capturesBasePath: capturesBasePath,
            fileName: captureItem.fileName
        });
    };

    // delete a capture file
    const onDeleteCaptureItem = (toDelete: CaptureItem) => {
        setCaptureItems(prevItems => prevItems.filter(item => item.fileName !== toDelete.fileName));
        if (selectedCaptureItem?.fileName === toDelete.fileName) {
            setSelectedCaptureItem(undefined);
        }
        vscode.postMessage({
            type: 'delete-capture-file',
            capturesBasePath: capturesBasePath,
            fileName: toDelete.fileName
        });
    };

    // send start profiler event to MC
    const onStartProfiler = () => {
        setProfilerCapturing(true);
        vscode.postMessage({ type: 'start-profiler' });
    }

    // send stop profiler event to MC
    const onStopProfiler = () => {
        setProfilerCapturing(false);
        vscode.postMessage({ type: 'stop-profiler', capturesBasePath: capturesBasePath });
    }

    //-------------------------------------------------------------------------
    // State and Event Handlers
    //-------------------------------------------------------------------------

    const [debuggerConnected, setDebuggerConnected] = useState<boolean>(false);
    const [supportsCommands, setSupportsCommands] = useState<boolean>(false);
    const [supportsProfiler, setSupportsProfiler] = useState<boolean>(false);

    useEffect(() => {
        // request debugger status on load
        vscode.postMessage({ type: 'request-debugger-status' });

        // external event listener
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

    //-------------------------------------------------------------------------
    // Save/Load state
    //-------------------------------------------------------------------------

    // load state at panel init
    useEffect(() => {
        const state = (vscode.getState() as SaveState) || { commandButtons: [], capturesPath: '' };
        if (state) {
            setCommandButtons(state.commandButtons);
            setCapturesBasePath(state.capturesBasePath);
        }
    }, []);

    // save state on change
    useEffect(() => {
        vscode.setState({
            commandButtons: commandButtons,
            capturesBasePath: capturesBasePath
        });
    }, [commandButtons, capturesBasePath]);

    //-------------------------------------------------------------------------
    // Render
    //-------------------------------------------------------------------------

    return (
        <main>
            <StatusSection
                debuggerConnected={debuggerConnected}
            />
            <DiagnosticSection 
                onShowDiagnosticsPanel={onShowDiagnosticsPanel} 
            />
            <CommandShortcutsSection
                commandButtons={commandButtons}
                onAddCommand={onAddCommand}
                onEditCommand={onEditCommand}
                onRunCommand={onRunCommand}
                onDeleteCommand={onDeleteCommand}
                debuggerConnected={debuggerConnected}
                supportsCommands={supportsCommands}
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
