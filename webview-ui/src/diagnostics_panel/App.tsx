// Copyright (C) Microsoft Corporation.  All rights reserved.

import { VSCodeDropdown, VSCodeOption, VSCodePanelTab, VSCodePanelView, VSCodePanels } from '@vscode/webview-ui-toolkit/react';
import { StatGroupSelectionBox } from './controls/StatGroupSelectionBox';
import { useCallback, useEffect, useState } from 'react';
import { StatisticType, YAxisStyle, YAxisType, createStatResolver } from './StatisticResolver';
import MinecraftStatisticLineChart from './controls/MinecraftStatisticLineChart';
import MinecraftStatisticStackedLineChart from './controls/MinecraftStatisticStackedLineChart';
import MinecraftStatisticStackedBarChart from './controls/MinecraftStatisticStackedBarChart';
import { MultipleStatisticProvider, SimpleStatisticProvider, StatisticUpdatedMessage } from './StatisticProvider';
import ReplayControls from './controls/ReplayControls';
import * as statPrefabs from './prefabs/StatisticPrefab';
import { Icons } from './Icons';
import './App.css';
import tabPrefabs from './prefabs';
import { TabPrefabDataSource } from './prefabs/TabPrefab';
import { DiagnosticsTabDescriptor } from './DiagnosticsSchema';
import DynamicTab from './DynamicTab';

declare global {
    interface Window {
        initialParams: any;
    }
}

const vscode = acquireVsCodeApi();

interface VSCodePanelsChangeEvent extends Event {
    target: EventTarget & { activeid: string };
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

function App() {
    const [selectedPlugin, setSelectedPlugin] = useState<string>('');
    const [selectedClient, setSelectedClient] = useState<string>('');
    const [currentTab, setCurrentTab] = useState<string>();
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

    const handlePanelChange = useCallback((event: VSCodePanelsChangeEvent): void => {
        const newTabId = event.target.activeid;
        if (newTabId) {
            setCurrentTab(newTabId);
        }
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
            } else if (message.type === 'diagnostics-schema') {
                setSchema(message.schema as DiagnosticsTabDescriptor[]);
                setSelectedSchemaIndex(0);
            }
        };
        window.addEventListener('message', handleMessage);
        return () => {
            window.removeEventListener('message', handleMessage);
        };
    }, []);

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

            {usingDynamicSchema ? (
                // Dynamic mode: schema received from game — dropdown selector + single DynamicTab
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0' }}>
                        <label htmlFor="tab-selector">Diagnostics Tab</label>
                        <VSCodeDropdown id="tab-selector" onChange={handleSchemaTabChange}>
                            {schema.map((descriptor, index) => (
                                <VSCodeOption key={index}>{descriptor.name}</VSCodeOption>
                            ))}
                        </VSCodeDropdown>
                    </div>

                    {activeDescriptor && (
                        <div style={{ flexDirection: 'column', display: 'flex' }}>
                            {activeDescriptor.data_source === 'client' && (
                                <StatGroupSelectionBox
                                    labelName="Client"
                                    statParentId="client_stats"
                                    onChange={handleClientSelection}
                                />
                            )}
                            {activeDescriptor.data_source === 'server_script' && (
                                <StatGroupSelectionBox
                                    labelName="Script Plugin"
                                    statParentId="handle_counts"
                                    onChange={handlePluginSelection}
                                />
                            )}
                            <DynamicTab
                                key={`${activeDescriptor.name}-${selectedSchemaIndex}`}
                                descriptor={activeDescriptor}
                                selectedClient={selectedClient}
                                selectedPlugin={selectedPlugin}
                            />
                        </div>
                    )}
                </div>
            ) : (
                // Static fallback: no schema received (older game version) — render hardcoded prefab tabs
                <VSCodePanels activeid={currentTab} onChange={event => handlePanelChange(event as VSCodePanelsChangeEvent)}>
                    {tabPrefabs.map((tabPrefab, index) => (
                        <VSCodePanelTab id={`tab-${index}`}>{tabPrefab.name}</VSCodePanelTab>
                    ))}
                    {tabPrefabs.map((tabPrefab, index) => (
                        <VSCodePanelView id={`view-${index}`} style={{ flexDirection: 'column' }}>
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
                            {tabPrefab.content({ selectedClient, selectedPlugin })}
                        </VSCodePanelView>
                    ))}
                </VSCodePanels>
            )}
        </main>
    );
}

export default App;
