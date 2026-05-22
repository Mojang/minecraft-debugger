// Copyright (C) Microsoft Corporation.  All rights reserved.

import { StatGroupSelectionBox } from './controls/StatGroupSelectionBox';
import { useCallback, useEffect, useState } from 'react';
import ReplayControls from './controls/ReplayControls';
import { Icons } from './Icons';
import './App.css';
import tabPrefabs from './prefabs';
import { TabPrefab, TabPrefabDataSource, TabPrefabParams } from './prefabs/TabPrefab';
import { handleDebuggerRequestResult } from './utilities/useDebuggerRequests';
import { vscode } from './utilities/vscode';

// Wraps each tab's content() as a proper React component so that any hooks
// inside the content function are correctly isolated and not called conditionally
// from the parent App component (which would violate the Rules of Hooks).
function TabView({ tabPrefab, params }: { tabPrefab: TabPrefab; params: TabPrefabParams }) {
    return <>{tabPrefab.content(params)}</>;
}

declare global {
    interface Window {
        initialParams: any;
    }
}

const onRestart = () => {
    vscode.postMessage({ type: 'restart' });
};

const onSlower = () => {
    vscode.postMessage({ type: 'slower' });
};

const onFaster = () => {
    vscode.postMessage({ type: 'faster' });
};

const onPause = () => {
    vscode.postMessage({ type: 'pause' });
};

const onResume = () => {
    vscode.postMessage({ type: 'resume' });
};

const onRunCommand = (command: string) => {
    vscode.postMessage({ type: 'run-minecraft-command', command: command });
};

function App() {
    const sortedTabPrefabs = [...tabPrefabs].sort((a, b) => a.name.localeCompare(b.name));
    const [selectedPlugin, setSelectedPlugin] = useState<string>('');
    const [selectedClient, setSelectedClient] = useState<string>('');
    const [currentTab, setCurrentTab] = useState<string>('tab-0');
    const [paused, setPaused] = useState<boolean>(true);
    const [speed, setSpeed] = useState<string>('');

    const handlePluginSelection = useCallback((pluginSelectionId: string) => {
        setSelectedPlugin(() => pluginSelectionId);
    }, []);

    const handleClientSelection = useCallback((clientSelectionId: string) => {
        setSelectedClient(() => clientSelectionId);
    }, []);



    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            const message = event.data;
            if (message.type === 'speed-updated') {
                setSpeed(`${message.speed}hz`);
            } else if (message.type === 'pause-updated') {
                setPaused(message.paused);
            } else if (message.type === 'debugger-request-result') {
                handleDebuggerRequestResult(message);
            }
        };
        window.addEventListener('message', handleMessage);
        return () => {
            window.removeEventListener('message', handleMessage);
        };
    }, [handleDebuggerRequestResult]);

    return (
        <main>
            {window.initialParams.showReplayControls && (
                <ReplayControls
                    speed={speed}
                    paused={paused}
                    onRestart={onRestart}
                    onPause={onPause}
                    onResume={onResume}
                    onSlower={onSlower}
                    onFaster={onFaster}
                    svgIcons={Icons}
                />
            )}
            <div className="vertical-tabs-container">
                <div className="vertical-tab-list">
                    {sortedTabPrefabs.map((tabPrefab, index) => (
                        <button
                            key={`tab-${index}`}
                            className={`vertical-tab-item${currentTab === `tab-${index}` ? ' active' : ''}`}
                            onClick={() => setCurrentTab(`tab-${index}`)}
                        >
                            {tabPrefab.name}
                        </button>
                    ))}
                </div>
                <div className="vertical-tab-content">
                    {sortedTabPrefabs.map((tabPrefab, index) => (
                        <div
                            key={`view-${index}`}
                            style={{ display: currentTab === `tab-${index}` ? 'flex' : 'none', flexDirection: 'column', flex: 1 }}
                        >
                            {tabPrefab.dataSource === TabPrefabDataSource.Client ? (
                                <StatGroupSelectionBox
                                    labelName="Client"
                                    statParentId="client_stats"
                                    onChange={handleClientSelection}
                                />
                            ) : (
                                <div />
                            )}
                            {tabPrefab.dataSource === TabPrefabDataSource.ServerScript ? (
                                <StatGroupSelectionBox
                                    labelName="Script Plugin"
                                    statParentId="handle_counts"
                                    onChange={handlePluginSelection}
                                />
                            ) : (
                                <div />
                            )}
                            <TabView
                                tabPrefab={tabPrefab}
                                params={{ selectedClient, selectedPlugin, onRunCommand }}
                            />
                        </div>
                    ))}
                </div>
            </div>
        </main>
    );
}

export default App;
