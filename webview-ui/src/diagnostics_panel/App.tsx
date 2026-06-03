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
import { DiagnosticsTabDescriptor } from './DiagnosticsSchema';

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

const CLIENT_SELECTION_HELP_TOOLTIP =
    "If you're not seeing your player here, you may need to enable diagnostic collection.\n" +
    'Please enable "Creator > Script Diagnostics Settings > Enable Client Diagnostics" from within the game settings.';

function App() {
    const sortedTabPrefabs = [...tabPrefabs].sort((a, b) => a.name.localeCompare(b.name));
    const [selectedPlugin, setSelectedPlugin] = useState<string>('');
    const [selectedClient, setSelectedClient] = useState<string>('');
    const [currentTab, setCurrentTab] = useState<string>('tab-0');
    const [paused, setPaused] = useState<boolean>(true);
    const [speed, setSpeed] = useState<string>('');
    // Dynamic schema received from the game on connect. Empty = use static prefab fallback.
    const [schema, setSchema] = useState<DiagnosticsTabDescriptor[]>([]);
    // Index of the selected tab in the dynamic dropdown
    const [selectedSchemaIndex, setSelectedSchemaIndex] = useState<number>(0);

    const handlePluginSelection = useCallback((pluginSelectionId: string) => {
        setSelectedPlugin(() => pluginSelectionId);
    }, []);

    const handleClientSelection = useCallback((clientSelectionId: string) => {
        setSelectedClient(() => clientSelectionId);
    }, []);

    const handleSchemaTabChange = useCallback((e: Event | React.FormEvent<HTMLElement>): void => {
        const target = e.target as HTMLSelectElement;
        setSelectedSchemaIndex(target.selectedIndex);
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
            } else if (message.type === 'diagnostics-schema') {
                setSchema(message.schema as DiagnosticsTabDescriptor[]);
                setSelectedSchemaIndex(0);
            }
        };
        window.addEventListener('message', handleMessage);
        return () => {
            window.removeEventListener('message', handleMessage);
        };
    }, [handleDebuggerRequestResult]);

    const usingDynamicSchema = schema.length > 0;
    const activeDescriptor = usingDynamicSchema ? schema[selectedSchemaIndex] : undefined;

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
                            style={{
                                display: currentTab === `tab-${index}` ? 'flex' : 'none',
                                flexDirection: 'column',
                                flex: 1,
                            }}
                        >
                            {tabPrefab.dataSource === TabPrefabDataSource.Client ? (
                                <StatGroupSelectionBox
                                    labelName="Client"
                                    statParentId="client_stats"
                                    onChange={handleClientSelection}
                                    helpTooltip={CLIENT_SELECTION_HELP_TOOLTIP}
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
                            <TabView tabPrefab={tabPrefab} params={{ selectedClient, selectedPlugin, onRunCommand }} />
                        </div>
                    ))}
                </div>
            </div>
        </main>
    );
}

export default App;
