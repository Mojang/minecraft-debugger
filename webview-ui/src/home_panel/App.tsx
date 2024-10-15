
// Copyright (C) Microsoft Corporation.  All rights reserved.

import { VSCodeButton, VSCodeTextField } from '@vscode/webview-ui-toolkit/react';
import React, { useState, useEffect, useRef } from 'react';
import './App.css';

const vscode = acquireVsCodeApi();

interface CommandButton {
    id: string;
    command: string;
}

interface SaveState {
    commandButtons: CommandButton[];
    capturesBasePath: string;
}

interface CaptureItem {
    fileName: string;
}

function App() {

    //-------------------------------------------------------------------------
    // Diagnostics
    //-------------------------------------------------------------------------

    // show the diagnostics panel
    const onShowDiagnosticsPanel = () => {
        vscode.postMessage({ type: 'show-diagnostics' });
    };

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

    // run a minecraft command
    const onRunCommand = (command: string) => {
        vscode.postMessage({ type: 'run-minecraft-command', command: command });
    };

    //-------------------------------------------------------------------------
    // Profiler
    //-------------------------------------------------------------------------

    const scrollingListRef = useRef<HTMLDivElement>(null);
    const [capturesBasePath, setCapturesBasePath] = useState<string>('');
    const [isProfilerCapturing, setProfilerCapturing] = useState(false);
    const [captureItems, setCaptureItems] = useState<CaptureItem[]>([]);
    const [selectedCaptureItem, setSelectedCaptureItem] = useState<CaptureItem | null>(null);

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

    // choose save path for profiler captures
    const onCaptureBasePathBrowseButtonPressed = () => {
        vscode.postMessage({ type: 'browse-captures-base-path' });
    };

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
            setSelectedCaptureItem(null);
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
        vscode.postMessage({ type: 'stop-profiler', capturesPath: capturesBasePath });
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
            if (state.commandButtons) {
                setCommandButtons(state.commandButtons);
            }
            if (state.capturesBasePath) {
                setCapturesBasePath(state.capturesBasePath);
            }
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
            <div className="status-container">
                <div
                    className={`status-circle ${debuggerConnected ? 'active' : 'inactive'}`}
                ></div>
                {debuggerConnected ? 'Minecraft Connected' : 'Minecraft Disconnected'}
            </div>
            <div className="section">
                <h3 className="title">Diagnostics</h3>
                <VSCodeButton className="standard-button" onClick={onShowDiagnosticsPanel}>
                    Show Diagnostics
                </VSCodeButton>
            </div>
            <div className="section">
                <h3 className="title">Minecraft Command Shortcuts</h3>
                <VSCodeButton className="standard-button" onClick={onAddCommand}>
                    Add Command Shortcut
                </VSCodeButton>
                {commandButtons.map(commandButton => (
                    <div key={commandButton.id} className="command-container">
                        <VSCodeTextField
                            type="text"
                            value={commandButton.command}
                            onChange={event =>
                                onEditCommand(commandButton.id, event as React.ChangeEvent<HTMLInputElement>)
                            }
                            className="command-input"
                        />
                        <VSCodeButton
                            className="command-run-button"
                            onClick={() => onRunCommand(commandButton.command)}
                            disabled={!debuggerConnected || !supportsCommands}
                        >
                            Run
                        </VSCodeButton>
                        <VSCodeButton className="command-delete-button" onClick={() => onDeleteCommand(commandButton.id)}>
                            Delete
                        </VSCodeButton>
                    </div>
                ))}
            </div>
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
        </main>
    );
}

export default App;
