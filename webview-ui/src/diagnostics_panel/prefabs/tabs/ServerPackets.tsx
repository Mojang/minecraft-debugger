import MinecraftStatisticLineChart from '../../controls/MinecraftStatisticLineChart';
import { StatisticPrefab } from '../StatisticPrefab';
import { SimpleStatisticProvider, RegexStatisticProvider } from '../../StatisticProvider';
import { StatisticType, YAxisType, createStatResolver, ParentNameStatResolver } from '../../StatisticResolver';
import { TabPrefab, TabPrefabDataSource } from '../TabPrefab';
import { generateRowsFromStatsPrefabs } from '../utilities';
import MinecraftStatisticStackedBarChart from '../../controls/MinecraftStatisticStackedBarChart';

const PACKETS_COLLECTOR = 'packets';
const NETWORKING_PACKETS_DETAILS_COLLECTOR = 'networking_packets_details';
const NETWORKING_PACKETS_DETAILS_PATTERN = new RegExp(`${NETWORKING_PACKETS_DETAILS_COLLECTOR}_.*`);

const packetsReceivedLineChart: StatisticPrefab = {
    name: 'Packets Received (Line)',
    collectorName: PACKETS_COLLECTOR,
    reactNode: (
        <MinecraftStatisticLineChart
            title="Packets Received"
            yLabel="Number Of Packets Received On The Server"
            statisticDataProvider={
                new SimpleStatisticProvider({
                    statisticId: 'received',
                    statisticParentId: PACKETS_COLLECTOR,
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
    collectorName: NETWORKING_PACKETS_DETAILS_COLLECTOR,
    reactNode: (
        <MinecraftStatisticStackedBarChart
            title="Packets Received"
            yLabel="Number Of Packets"
            statisticDataProvider={
                new RegexStatisticProvider({
                    statisticParentId: NETWORKING_PACKETS_DETAILS_PATTERN,
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
    collectorName: PACKETS_COLLECTOR,
    reactNode: (
        <MinecraftStatisticLineChart
            title="Packets Sent"
            yLabel="Number Of Packets Sent From The Server"
            statisticDataProvider={
                new SimpleStatisticProvider({
                    statisticId: 'sent',
                    statisticParentId: PACKETS_COLLECTOR,
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
    collectorName: NETWORKING_PACKETS_DETAILS_COLLECTOR,
    reactNode: (
        <MinecraftStatisticStackedBarChart
            title="Packets Sent"
            yLabel="Number Of Packets"
            statisticDataProvider={
                new RegexStatisticProvider({
                    statisticParentId: NETWORKING_PACKETS_DETAILS_PATTERN,
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
    collectors: [
        packetsReceivedLineChart,
        packetsReceivedStackedLineChart,
        packetsSentLineChart,
        packetsSentStackedLineChart,
    ],
    content: () => {
        return generateRowsFromStatsPrefabs([
            [packetsReceivedLineChart, packetsSentLineChart],
            [packetsReceivedStackedLineChart, packetsSentStackedLineChart],
        ]);
    },
};

export default statsTab;
