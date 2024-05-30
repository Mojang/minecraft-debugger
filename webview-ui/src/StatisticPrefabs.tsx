// Copyright (C) Microsoft Corporation.  All rights reserved.

import { ReactNode } from 'react';
import {
    NestedStatResolver,
    ParentNameStatResolver,
    StatisticType,
    YAxisType,
    createStatResolver,
} from './StatisticResolver';
import MinecraftStatisticLineChart from './controls/MinecraftStatisticLineChart';
import MinecraftStatisticStackedLineChart from './controls/MinecraftStatisticStackedLineChart';
import MinecraftStatisticStackedBarChart from './controls/MinecraftStatisticStackedBarChart';
import {
    MultipleStatisticProvider,
    NestedStatisticProvider,
    RegexStatisticProvider,
    SimpleStatisticProvider,
} from './StatisticProvider';

interface StatisticPrefab {
    name: string;
    reactNode: ReactNode;
}

export const entityCount: StatisticPrefab = {
    name: 'Entity Count',
    reactNode: (
        <MinecraftStatisticLineChart
            title="Entities"
            yLabel="Number of Entities"
            statisticDataProvider={new SimpleStatisticProvider({ statisticId: 'entities', statisticParentId: '' })}
            statisticOptions={{
                type: StatisticType.Absolute,
                yAxisType: YAxisType.Absolute,
                tickRange: 20 * 30, // About 30 seconds
            }}
        />
    ),
};

export const loadedChunks: StatisticPrefab = {
    name: 'Loaded Chunks',
    reactNode: (
        <MinecraftStatisticStackedLineChart
            title="Chunks Loaded"
            statisticDataProvider={new NestedStatisticProvider({ statisticParentIds: ['chunks'] })}
            statisticResolver={NestedStatResolver(
                createStatResolver({
                    type: StatisticType.Absolute,
                    tickRange: 20 * 60 /* About 60 seconds */,
                    yAxisType: YAxisType.Absolute,
                })
            )}
            yLabel="Number of Chunks"
        />
    ),
};

export const appMemoryUsage: StatisticPrefab = {
    name: 'App Memory Usage',
    reactNode: (
        <MinecraftStatisticLineChart
            title="App Memory Used"
            yLabel="Memory (MB)"
            statisticDataProvider={
                new SimpleStatisticProvider({ statisticId: 'used', statisticParentId: 'app_memory' })
            }
            statisticOptions={{
                type: StatisticType.Absolute,
                yAxisType: YAxisType.Centered,
                valueScalar: 1 / 1000000,
                tickRange: 20 * 60, // About 60 seconds
            }}
        />
    ),
};

export const appMemoryFree: StatisticPrefab = {
    name: 'App Memory Free',
    reactNode: (
        <MinecraftStatisticLineChart
            title="App Memory Free"
            yLabel="Memory (MB)"
            statisticDataProvider={
                new SimpleStatisticProvider({ statisticId: 'free', statisticParentId: 'app_memory' })
            }
            statisticOptions={{
                type: StatisticType.Absolute,
                yAxisType: YAxisType.Centered,
                valueScalar: 1 / 1000000,
                tickRange: 20 * 60, // About 60 seconds
            }}
        />
    ),
};
export const javaScriptMemoryFree: StatisticPrefab = {
    name: 'JavaScript Memory Used',
    reactNode: (
        <MinecraftStatisticLineChart
            title="JavaScript Memory Used"
            yLabel="Memory Used (MB)"
            statisticDataProvider={
                new SimpleStatisticProvider({
                    statisticId: 'used',
                    statisticParentId: 'runtime_memory',
                })
            }
            statisticOptions={{
                type: StatisticType.Absolute,
                yAxisType: YAxisType.Centered,
                valueScalar: 1 / 1000000,
                tickRange: 20 * 60, // About 60 seconds
            }}
        />
    ),
};
export const javaScriptMemoryAllocated: StatisticPrefab = {
    name: 'JavaScript Memory Free',
    reactNode: (
        <MinecraftStatisticLineChart
            title="JavaScript Memory Allocated"
            yLabel="Memory Used (MB)"
            statisticDataProvider={
                new SimpleStatisticProvider({
                    statisticId: 'allocated',
                    statisticParentId: 'runtime_memory',
                })
            }
            statisticOptions={{
                type: StatisticType.Absolute,
                yAxisType: YAxisType.Centered,
                valueScalar: 1 / 1000000,
                tickRange: 20 * 60, // About 60 seconds
            }}
        />
    ),
};
export const serverTickTimings: StatisticPrefab = {
    name: 'Server Tick Timings',
    reactNode: (
        <MinecraftStatisticStackedLineChart
            title="Server Tick"
            statisticDataProvider={
                new MultipleStatisticProvider({
                    statisticIds: ['level_tick', 'script_tick', 'script_job_tick'],
                    statisticParentId: 'server_tick_timings',
                })
            }
            catageoryLabels={{
                level_tick: 'Level Tick',
                script_tick: 'Scripting Tick',
                script_job_tick: 'Scripting Job System',
            }}
            statisticResolver={createStatResolver({
                type: StatisticType.Absolute,
                tickRange: 20 * 10 /* About 10 seconds */,
                yAxisType: YAxisType.Absolute,
                valueScalar: 1 / 1000, // Microseconds to milliseconds
            })}
            yLabel="Server Tick Time (ms)"
            targetValue={50} // 50ms is the target for server time, 20hz
        />
    ),
};
export const commandsRan: StatisticPrefab = {
    name: 'Commands Ran',
    reactNode: (
        <MinecraftStatisticStackedLineChart
            title="Commands Run"
            statisticDataProvider={
                new MultipleStatisticProvider({
                    statisticParentId: 'commands',
                })
            }
            statisticResolver={createStatResolver({
                type: StatisticType.Absolute,
                tickRange: 20 * 10 /* About 10 seconds */,
                yAxisType: YAxisType.Absolute,
            })}
            yLabel="Number of Commands"
        />
    ),
};
export const packetsReceivedLineChart: StatisticPrefab = {
    name: 'Packets Received (Line)',
    reactNode: (
        <MinecraftStatisticLineChart
            title="Packets Received"
            yLabel="Number Of Packets Received On The Server"
            statisticDataProvider={
                new SimpleStatisticProvider({
                    statisticId: 'received',
                    statisticParentId: 'packets',
                })
            }
            statisticOptions={{
                type: StatisticType.Absolute,
                yAxisType: YAxisType.Absolute,
                tickRange: 20 * 15, // About 15 seconds
            }}
        />
    ),
};
export const packetsReceivedStackedLineChart: StatisticPrefab = {
    name: 'Packets Recieved (Stack)',
    reactNode: (
        <MinecraftStatisticStackedBarChart
            title="Packets Received"
            yLabel="Number Of Packets"
            statisticDataProvider={
                new RegexStatisticProvider({
                    statisticParentId: /networking_packets_details_.*/,
                    statisticId: 'received',
                    ignoredValues: [0],
                })
            }
            statisticResolver={ParentNameStatResolver(
                createStatResolver({
                    type: StatisticType.Absolute,
                    tickRange: 20 * 15 /* About 15 seconds */,
                    yAxisType: YAxisType.Absolute,
                })
            )}
        />
    ),
};
export const packetsSentLineChart: StatisticPrefab = {
    name: 'Packets Sent (Line)',
    reactNode: (
        <MinecraftStatisticLineChart
            title="Packets Sent"
            yLabel="Number Of Packets Sent From The Server"
            statisticDataProvider={
                new SimpleStatisticProvider({
                    statisticId: 'sent',
                    statisticParentId: 'packets',
                })
            }
            statisticOptions={{
                type: StatisticType.Absolute,
                yAxisType: YAxisType.Absolute,
                tickRange: 20 * 15, // About 15 seconds
            }}
        />
    ),
};
export const packetsSentStackedLineChart: StatisticPrefab = {
    name: 'Packets Sent (Stack)',
    reactNode: (
        <MinecraftStatisticStackedBarChart
            title="Packets Sent"
            yLabel="Number Of Packets"
            statisticDataProvider={
                new RegexStatisticProvider({
                    statisticParentId: /networking_packets_details_.*/,
                    statisticId: 'sent',
                    ignoredValues: [0],
                })
            }
            statisticResolver={ParentNameStatResolver(
                createStatResolver({
                    type: StatisticType.Absolute,
                    tickRange: 20 * 15 /* About 15 seconds */,
                    yAxisType: YAxisType.Absolute,
                })
            )}
        />
    ),
};
export const packetDataReceived: StatisticPrefab = {
    name: 'Packet Data Received',
    reactNode: (
        <MinecraftStatisticLineChart
            title="Data Received"
            yLabel="Data (KB)"
            statisticDataProvider={
                new SimpleStatisticProvider({
                    statisticId: 'received_bytes',
                    statisticParentId: 'packets',
                })
            }
            statisticOptions={{
                type: StatisticType.Absolute,
                yAxisType: YAxisType.Absolute,
                tickRange: 20 * 15, // About 15 seconds
                valueScalar: 1 / 1000, // byte to kilobyte
            }}
        />
    ),
};
export const packetDataSent: StatisticPrefab = {
    name: 'Packet Data Sent',
    reactNode: (
        <MinecraftStatisticLineChart
            title="Data Sent"
            yLabel="Data (KB)"
            statisticDataProvider={
                new SimpleStatisticProvider({
                    statisticId: 'sent_bytes',
                    statisticParentId: 'packets',
                })
            }
            statisticOptions={{
                type: StatisticType.Absolute,
                yAxisType: YAxisType.Absolute,
                tickRange: 20 * 15, // About 15 seconds
                valueScalar: 1 / 1000, // byte to kilobyte
            }}
        />
    ),
};

/* TODO: Figure out this stuff
export const entityHandleCount: StatisticPrefab = {
    name: 'Entity Handle Count',
    reactNode: (
        <MinecraftStatisticLineChart
            title="Entity Handles"
            yLabel="Number of Entities"
            statisticDataProvider={
                new SimpleStatisticProvider({
                    statisticId: 'entity',
                    statisticParentId: selectedPlugin,
                })
            }
            statisticOptions={{
                type: StatisticType.Absolute,
                yAxisType: YAxisType.Absolute,
                tickRange: 20 * 30, // About 30 seconds
            }}
        />
    ),
};
export const entityHandleCountDiff: StatisticPrefab = {
    name: 'Entity Handle Count (Diff)',
    reactNode: (
        <MinecraftStatisticLineChart
            title="Entity Changes"
            yLabel="Difference in Number of Entities"
            statisticDataProvider={
                new SimpleStatisticProvider({
                    statisticId: 'entity',
                    statisticParentId: selectedPlugin,
                })
            }
            statisticOptions={{
                type: StatisticType.Difference,
                yAxisType: YAxisType.Mirrored,
                tickRange: 20 * 30, // About 30 seconds
            }}
        />
    ),
};
*/
