// Copyright (C) Microsoft Corporation.  All rights reserved.

import { VSCodePanelTab, VSCodePanelView, VSCodePanels } from '@vscode/webview-ui-toolkit/react';
import './App.css';
import ScriptPluginSelectionBox from './controls/ScriptPluginSelectionBox';
import { useState } from 'react';
import { StatisticType, YAxisType } from './StatisticResolver';
import MinecraftStatisticLineChart from './controls/MinecraftStatisticLineChart';
import { SimpleStatisticProvider } from './StatisticProvider';

import * as statPrefabs from './StatisticPrefabs';

interface CustomPageData {
    id: number;
    name: string;
}

function App() {
    // State
    const [selectedPlugin, setSelectedPlugin] = useState<string>('no_plugin_selected');

    return (
        <main>
            <VSCodePanels>
                <VSCodePanelTab id="tab-1">World</VSCodePanelTab>
                <VSCodePanelTab id="tab-2">Memory</VSCodePanelTab>
                <VSCodePanelTab id="tab-3">Timing</VSCodePanelTab>
                <VSCodePanelTab id="tab-4">Networking - Packets</VSCodePanelTab>
                <VSCodePanelTab id="tab-5">Networking - Bandwidth</VSCodePanelTab>
                <VSCodePanelTab id="tab-6">Handle Counts</VSCodePanelTab>
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
                <VSCodePanelView id="view-4">
                    <div style={{ flexDirection: 'column' }}>
                        {statPrefabs.packetsReceivedLineChart.reactNode}
                        {statPrefabs.packetsReceivedStackedLineChart.reactNode}
                    </div>
                    <div style={{ flexDirection: 'column' }}>
                        {statPrefabs.packetsSentLineChart.reactNode}
                        {statPrefabs.packetsSentStackedLineChart.reactNode}
                    </div>
                </VSCodePanelView>
                <VSCodePanelView id="view-4">
                    {statPrefabs.packetDataReceived.reactNode}
                    {statPrefabs.packetDataSent.reactNode}
                </VSCodePanelView>
                <VSCodePanelView id="view-6">
                    <ScriptPluginSelectionBox
                        onChange={(pluginSelectionId: string) => {
                            console.log(`Selected Plugin: ${pluginSelectionId}`);
                            setSelectedPlugin(() => pluginSelectionId);
                        }}
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
