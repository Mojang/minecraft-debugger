// Copyright (C) Microsoft Corporation.  All rights reserved.

import { VSCodePanelTab, VSCodePanelView, VSCodePanels } from '@vscode/webview-ui-toolkit/react';
import './App.css';
import { StatGroupSelectionBox } from './controls/StatGroupSelectionBox';
import { useCallback, useState } from 'react';
import { StatisticType, YAxisType, createStatResolver } from './StatisticResolver';
import MinecraftStatisticLineChart from './controls/MinecraftStatisticLineChart';
import MinecraftStatisticStackedLineChart from './controls/MinecraftStatisticStackedLineChart';
import { MultipleStatisticProvider, SimpleStatisticProvider } from './StatisticProvider';

import * as statPrefabs from './StatisticPrefabs';

function App() {
    // State
    const [selectedPlugin, setSelectedPlugin] = useState<string>('no_plugin_selected');

    const handlePluginSelection = useCallback((pluginSelectionId: string) => {
        console.log(`Selected Plugin: ${pluginSelectionId}`);
        setSelectedPlugin(() => pluginSelectionId);
    }, []);

    const [selectedClient, setSelectedClient] = useState<string>('no_client_selected');

    const handleClientSelection = useCallback((clientSelectionId: string) => {
        console.log(`Selected Client: ${clientSelectionId}`);
        setSelectedClient(() => clientSelectionId);
    }, []);

    return (
        <main>
            <VSCodePanels>
                <VSCodePanelTab id="tab-1">World</VSCodePanelTab>
                <VSCodePanelTab id="tab-2">Memory</VSCodePanelTab>
                <VSCodePanelTab id="tab-3">Server Timing</VSCodePanelTab>
                <VSCodePanelTab id="tab-4">Client Timing</VSCodePanelTab>
                <VSCodePanelTab id="tab-5">Networking - Packets</VSCodePanelTab>
                <VSCodePanelTab id="tab-6">Networking - Bandwidth</VSCodePanelTab>
                <VSCodePanelTab id="tab-7">Handle Counts</VSCodePanelTab>
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
                        defaultDropdownId="no_client_selected"
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
                        defaultDropdownId="no_plugin_selected"
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
            </VSCodePanels>
        </main>
    );
}

export default App;
