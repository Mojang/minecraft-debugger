// Copyright (C) Microsoft Corporation.  All rights reserved.

import { VSCodePanelTab, VSCodePanelView, VSCodePanels } from '@vscode/webview-ui-toolkit/react';
import { StatGroupSelectionBox } from './controls/StatGroupSelectionBox';
import { useCallback, useEffect, useState } from 'react';
import { StatisticType, YAxisStyle, YAxisType, createStatResolver } from './StatisticResolver';
import MinecraftStatisticLineChart from './controls/MinecraftStatisticLineChart';
import MinecraftStatisticStackedLineChart from './controls/MinecraftStatisticStackedLineChart';
import MinecraftStatisticStackedBarChart from './controls/MinecraftStatisticStackedBarChart';
import { MultipleStatisticProvider, SimpleStatisticProvider, StatisticUpdatedMessage } from './StatisticProvider';
import ReplayControls from './controls/ReplayControls';
import * as statPrefabs from './StatisticPrefabs';
import { MinecraftDynamicPropertiesTable } from './controls/MinecraftDynamicPropertiesTable';
import { Icons } from './Icons';
import './App.css';

declare global {
    interface Window {
        initialParams: any;
    }
}

const vscode = acquireVsCodeApi();

interface VSCodePanelsChangeEvent extends Event {
    target: EventTarget & { activeid: string };
}

// Filter out events with a value of zero that haven't been previously subscribed to
function constructSubscribedSignalFilter() {
    const nonFilteredValues: string[] = [];
    const func = (event: StatisticUpdatedMessage) => {
        if (event.values.length === 1 && event.values[0] === 0 && !nonFilteredValues.includes(event.id)) {
            return false;
        }
        nonFilteredValues.push(event.id);
        return true;
    };
    return func;
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

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            const message = event.data;
            if (message.type === 'speed-updated') {
                setSpeed(`${message.speed}hz`);
            } else if (message.type === 'pause-updated') {
                setPaused(message.paused);
            }
        };
        window.addEventListener('message', handleMessage);
        return () => {
            window.removeEventListener('message', handleMessage);
        };
    }, []);

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
            <VSCodePanels activeid={currentTab} onChange={event => handlePanelChange(event as VSCodePanelsChangeEvent)}>
                <VSCodePanelTab id="tab-1">World</VSCodePanelTab>
                <VSCodePanelTab id="tab-2">Memory</VSCodePanelTab>
                <VSCodePanelTab id="tab-3">Server Timing</VSCodePanelTab>
                <VSCodePanelTab id="tab-4">Client Timing</VSCodePanelTab>
                <VSCodePanelTab id="tab-5">Networking - Packets</VSCodePanelTab>
                <VSCodePanelTab id="tab-6">Networking - Bandwidth</VSCodePanelTab>
                <VSCodePanelTab id="tab-7">Handle Counts</VSCodePanelTab>
                <VSCodePanelTab id="tab-8">Subscriber Counts</VSCodePanelTab>
                <VSCodePanelTab id="tab-9">Global Dynamic Properties</VSCodePanelTab>
                <VSCodePanelView id="view-1" style={{ flexDirection: 'column' }}>
                    <div style={{ flexDirection: 'row', display: 'flex' }}>
                        {statPrefabs.entityCount.reactNode}
                        {statPrefabs.loadedChunks.reactNode}
                    </div>
                    <div style={{ flexDirection: 'row', display: 'flex' }}>{statPrefabs.commandsRan.reactNode}</div>
                </VSCodePanelView>
                <VSCodePanelView id="view-2" style={{ flexDirection: 'column' }}>
                    <div style={{ flexDirection: 'row', display: 'flex' }}>
                        {statPrefabs.appMemoryUsage.reactNode}
                        {statPrefabs.appMemoryFree.reactNode}
                    </div>
                    <div style={{ flexDirection: 'row', display: 'flex' }}>
                        {statPrefabs.javaScriptMemoryAllocated.reactNode}
                        {statPrefabs.javaScriptMemoryFree.reactNode}
                    </div>
                </VSCodePanelView>
                <VSCodePanelView id="view-3" style={{ flexDirection: 'column' }}>
                    <div style={{ flexDirection: 'row', display: 'flex' }}>
                        {statPrefabs.serverTickTimings.reactNode}
                    </div>
                    <div style={{ flexDirection: 'row', display: 'flex' }}>{statPrefabs.commandsRan.reactNode}</div>
                </VSCodePanelView>
                <VSCodePanelView id="view-4" style={{ flexDirection: 'column' }}>
                    <StatGroupSelectionBox
                        labelName="Client"
                        statParentId="client_frame_timings"
                        onChange={handleClientSelection}
                    />
                    <MinecraftStatisticLineChart
                        title="FPS"
                        yLabel="FPS"
                        statisticDataProvider={
                            new SimpleStatisticProvider({
                                statisticId: 'avg_fps',
                                statisticParentId: new RegExp(`client_frame_timings_${selectedClient}`),
                            })
                        }
                        statisticOptions={{
                            type: StatisticType.Absolute,
                            yAxisType: YAxisType.Absolute,
                            tickRange: 20 * 10,
                        }}
                    />
                    <MinecraftStatisticStackedLineChart
                        title="Frame Timings"
                        yLabel="Frame Times (ms)"
                        statisticDataProvider={
                            new MultipleStatisticProvider({
                                statisticIds: [
                                    'avg_server_simtick_time',
                                    'avg_client_simtick_time',
                                    'avg_begin_frame_time',
                                    'avg_input_time',
                                    'avg_render_time',
                                    'avg_end_frame_time',
                                ],
                                statisticParentId: new RegExp(`client_frame_timings_${selectedClient}`),
                            })
                        }
                        catageoryLabels={{
                            avg_server_simtick_time: 'Server Simtick Time',
                            avg_client_simtick_time: 'Client Simtick Time',
                            avg_begin_frame_time: 'Begin Frame Time',
                            avg_input_time: 'Input Time',
                            avg_render_time: 'Render Time',
                            avg_end_frame_time: 'End Frame Time',
                        }}
                        statisticResolver={createStatResolver({
                            type: StatisticType.Absolute,
                            tickRange: 20 * 10,
                            yAxisType: YAxisType.Absolute,
                            valueScalar: 1 / 1000,
                        })}
                    />
                </VSCodePanelView>
                <VSCodePanelView id="view-5">
                    <div style={{ flexDirection: 'column' }}>
                        {statPrefabs.packetsReceivedLineChart.reactNode}
                        {statPrefabs.packetsReceivedStackedLineChart.reactNode}
                    </div>
                    <div style={{ flexDirection: 'column' }}>
                        {statPrefabs.packetsSentLineChart.reactNode}
                        {statPrefabs.packetsSentStackedLineChart.reactNode}
                    </div>
                </VSCodePanelView>
                <VSCodePanelView id="view-6">
                    {statPrefabs.packetDataReceived.reactNode}
                    {statPrefabs.packetDataSent.reactNode}
                </VSCodePanelView>
                <VSCodePanelView id="view-7">
                    <StatGroupSelectionBox
                        labelName="Script Plugin"
                        statParentId="handle_counts"
                        onChange={handlePluginSelection}
                    />
                    <MinecraftStatisticLineChart
                        title="Entity Handles"
                        yLabel="Number of Entities"
                        statisticDataProvider={
                            new SimpleStatisticProvider({
                                statisticId: 'entity',
                                statisticParentId: new RegExp(`handle_counts_${selectedPlugin}`),
                            })
                        }
                        statisticOptions={{
                            type: StatisticType.Absolute,
                            yAxisType: YAxisType.Absolute,
                            tickRange: 20 * 30, // About 30 seconds
                        }}
                    />
                    <MinecraftStatisticLineChart
                        title="Entity Changes"
                        yLabel="Difference in Number of Entities"
                        statisticDataProvider={
                            new SimpleStatisticProvider({
                                statisticId: 'entity',
                                statisticParentId: new RegExp(`handle_counts_${selectedPlugin}`),
                            })
                        }
                        statisticOptions={{
                            type: StatisticType.Difference,
                            yAxisType: YAxisType.Mirrored,
                            tickRange: 20 * 30, // About 30 seconds
                        }}
                    />
                </VSCodePanelView>
                <VSCodePanelView id="view-8">
                    <StatGroupSelectionBox
                        labelName="Script Plugin"
                        statParentId="fine_grained_subscribers"
                        onChange={handlePluginSelection}
                    />
                    <MinecraftStatisticStackedBarChart
                        title="Signal Subscribers"
                        yLabel="Number of World and System Before and After Event Subscribers Broken Down By Signal"
                        statisticDataProvider={
                            new MultipleStatisticProvider({
                                statisticParentId: new RegExp(`fine_grained_subscribers_${selectedPlugin}`),
                                valuesFilter: constructSubscribedSignalFilter(),
                            })
                        }
                        statisticResolver={createStatResolver({
                            type: StatisticType.Absolute,
                            tickRange: 20 * 15 /* About 15 seconds */,
                            yAxisType: YAxisType.Absolute,
                        })}
                    />
                </VSCodePanelView>
                <VSCodePanelView id="view-9">
                    <MinecraftDynamicPropertiesTable
                        statisticDataProviders={
                            new SimpleStatisticProvider({
                                statisticParentId: /dynamic_property_values*/,
                                statisticId: 'consolidated_data',
                            })
                        }
                    />
                </VSCodePanelView>
            </VSCodePanels>
        </main>
    );
}

export default App;
