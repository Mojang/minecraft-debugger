// Copyright (C) Microsoft Corporation.  All rights reserved.

import { StatGroupSelectionBox } from './controls/StatGroupSelectionBox';
import { useCallback, useEffect, useMemo, useState } from 'react';
import ReplayControls from './controls/ReplayControls';
import { Icons } from './Icons';
import './App.css';
import tabPrefabs from './prefabs';
import { TabPrefab, TabPrefabDataSource, TabPrefabParams } from './prefabs/TabPrefab';
import { handleDebuggerRequestResult } from './utilities/useDebuggerRequests';
import { vscode } from './utilities/vscode';
import DynamicTab from './DynamicTab';
import { DiagnosticsTabDescriptor } from '../../../src/diagnostics-schema';

// Wraps each tab's content() as a proper React component so that any hooks
// inside the content function are correctly isolated and not called conditionally
// from the parent App component (which would violate the Rules of Hooks).
function TabView({ tabPrefab, params }: { tabPrefab: TabPrefab; params: TabPrefabParams }) {
    return <>{tabPrefab.content(params)}</>;
}

const sortedTabPrefabs = [...tabPrefabs].sort((a, b) => a.name.localeCompare(b.name));

// A tab entry is either a hardcoded prefab or a dynamic descriptor received from the game.
type MergedTab =
    | { kind: 'prefab'; name: string; tab: TabPrefab }
    | { kind: 'dynamic'; name: string; descriptor: DiagnosticsTabDescriptor };

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
    const [selectedPlugin, setSelectedPlugin] = useState<string>('');
    const [selectedClient, setSelectedClient] = useState<string>('');
    const [currentTab, setCurrentTab] = useState<string>(sortedTabPrefabs[0]?.name ?? '');
    const [paused, setPaused] = useState<boolean>(true);
    const [speed, setSpeed] = useState<string>('');
    const [enabledTabs, setEnabledTabs] = useState<Record<string, boolean>>(
        window.initialParams.diagnosticsTabStates ?? {},
    );
    const [pendingTabs, setPendingTabs] = useState<Record<string, boolean>>({});
    // Dynamic schema received from the game on connect. Merged into the prefab tab list.
    const [schema, setSchema] = useState<DiagnosticsTabDescriptor[]>([]);

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
            } else if (message.type === 'diagnostics-schema') {
                setSchema(message.schema as DiagnosticsTabDescriptor[]);
            } else if (message.type === 'diagnostics-tab-state' && typeof message.tabName === 'string') {
                setEnabledTabs(previous => ({ ...previous, [message.tabName]: message.active === true }));
                setPendingTabs(previous => {
                    const next = { ...previous };
                    delete next[message.tabName];
                    return next;
                });
            }
        };
        window.addEventListener('message', handleMessage);
        return () => {
            window.removeEventListener('message', handleMessage);
        };
    }, [handleDebuggerRequestResult]);

    // Merge schema tabs into the prefab list. Schema tabs whose name matches a prefab replace it;
    // new names are appended. Falls back to all prefabs when no schema has arrived yet.
    const mergedTabs: MergedTab[] = useMemo(() => {
        const merged: MergedTab[] = sortedTabPrefabs.map(tab => ({
            kind: 'prefab' as const,
            name: tab.name,
            tab,
        }));
        for (const descriptor of schema) {
            const existingIndex = merged.findIndex(t => t.name === descriptor.name);
            if (existingIndex !== -1) {
                merged[existingIndex] = { kind: 'dynamic' as const, name: descriptor.name, descriptor };
            } else {
                merged.push({ kind: 'dynamic' as const, name: descriptor.name, descriptor });
            }
        }
        merged.sort((a, b) => a.name.localeCompare(b.name));
        return merged;
    }, [schema]);

    useEffect(() => {
        if (!window.initialParams.showReplayControls) {
            const states = Object.fromEntries(mergedTabs.map(tab => [tab.name, enabledTabs[tab.name] === true]));
            vscode.postMessage({ type: 'sync-diagnostics-tabs', states });
        }
    }, [mergedTabs]);

    const setTabActive = (tabName: string, active: boolean) => {
        if (window.initialParams.showReplayControls || pendingTabs[tabName] !== undefined) {
            return;
        }

        setPendingTabs(previous => ({ ...previous, [tabName]: active }));
        vscode.postMessage({ type: 'set-diagnostics-active', tabName, active });
    };

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
                    {mergedTabs.map(tab => (
                        <div className="vertical-tab-row" key={tab.name}>
                            <button
                                className={`vertical-tab-item${currentTab === tab.name ? ' active' : ''}${
                                    !window.initialParams.showReplayControls && enabledTabs[tab.name] !== true
                                        ? ' disabled'
                                        : ''
                                }`}
                                onClick={() => setCurrentTab(tab.name)}
                            >
                                {tab.name}
                            </button>
                            {!window.initialParams.showReplayControls && (
                                <button
                                    className="diagnostics-tab-toggle"
                                    aria-label={`${enabledTabs[tab.name] === true ? 'Disable' : 'Enable'} ${tab.name}`}
                                    title={`${enabledTabs[tab.name] === true ? 'Disable' : 'Enable'} ${tab.name}`}
                                    disabled={pendingTabs[tab.name] !== undefined}
                                    onClick={event => {
                                        event.stopPropagation();
                                        setTabActive(tab.name, enabledTabs[tab.name] !== true);
                                    }}
                                >
                                    {pendingTabs[tab.name] !== undefined
                                        ? '…'
                                        : enabledTabs[tab.name] === true
                                            ? Icons.enabled
                                            : Icons.disabled}
                                </button>
                            )}
                        </div>
                    ))}
                </div>
                <div className="vertical-tab-content">
                    {mergedTabs.map(tab => (
                        <div
                            key={tab.name}
                            style={{
                                display: currentTab === tab.name ? 'flex' : 'none',
                                flexDirection: 'column',
                                flex: 1,
                            }}
                        >
                            {window.initialParams.showReplayControls || enabledTabs[tab.name] === true ? (
                                tab.kind === 'prefab' ? (
                                    <>
                                        {tab.tab.dataSource === TabPrefabDataSource.Client ? (
                                            <StatGroupSelectionBox
                                                labelName="Client"
                                                statParentId="client_stats"
                                                onChange={handleClientSelection}
                                                helpTooltip={CLIENT_SELECTION_HELP_TOOLTIP}
                                            />
                                        ) : (
                                            <div />
                                        )}
                                        {tab.tab.dataSource === TabPrefabDataSource.ServerScript ? (
                                            <StatGroupSelectionBox
                                                labelName="Script Plugin"
                                                statParentId="handle_counts"
                                                onChange={handlePluginSelection}
                                            />
                                        ) : (
                                            <div />
                                        )}
                                        <TabView
                                            tabPrefab={tab.tab}
                                            params={{ selectedClient, selectedPlugin, onRunCommand }}
                                        />
                                    </>
                                ) : (
                                    !tab.descriptor.is_empty_tab && (
                                        <>
                                            {tab.descriptor.data_source === 'client' && (
                                                <StatGroupSelectionBox
                                                    labelName="Client"
                                                    statParentId="client_stats"
                                                    onChange={handleClientSelection}
                                                    helpTooltip={CLIENT_SELECTION_HELP_TOOLTIP}
                                                />
                                            )}
                                            {tab.descriptor.data_source === 'server_script' && (
                                                <StatGroupSelectionBox
                                                    labelName="Script Plugin"
                                                    statParentId="handle_counts"
                                                    onChange={handlePluginSelection}
                                                />
                                            )}
                                            <DynamicTab
                                                descriptor={tab.descriptor}
                                                selectedClient={selectedClient}
                                                selectedPlugin={selectedPlugin}
                                            />
                                        </>
                                    )
                                )
                            ) : (
                                <div className="diagnostics-tab-disabled">
                                    Enable this tab to start receiving its diagnostics data.
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </main>
    );
}

export default App;
