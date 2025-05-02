import MinecraftStatisticLineChart from '../../controls/MinecraftStatisticLineChart';
import { StatisticPrefab } from '../StatisticPrefab';
import { SimpleStatisticProvider, RegexStatisticProvider } from '../../StatisticProvider';
import { StatisticType, YAxisType, createStatResolver, ParentNameStatResolver } from '../../StatisticResolver';
import { TabPrefab, TabPrefabDataSource } from '../TabPrefab';
import { generateRowsFromStatsPrefabs } from '../utilities';
import MinecraftStatisticStackedBarChart from '../../controls/MinecraftStatisticStackedBarChart';

const packetsReceivedLineChart: StatisticPrefab = {
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

const packetsReceivedStackedLineChart: StatisticPrefab = {
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

const packetsSentLineChart: StatisticPrefab = {
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

const packetsSentStackedLineChart: StatisticPrefab = {
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

const statsTab: TabPrefab = {
    name: 'Server - Packets',
    dataSource: TabPrefabDataSource.Server,
    content: () => {
        return generateRowsFromStatsPrefabs([
            [packetsReceivedLineChart, packetsSentLineChart],
            [packetsReceivedStackedLineChart, packetsSentStackedLineChart],
        ]);
    },
};

export default statsTab;
