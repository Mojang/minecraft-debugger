import MinecraftStatisticLineChart from '../../controls/MinecraftStatisticLineChart';
import { StatisticPrefab } from '../StatisticPrefab';
import { SimpleStatisticProvider } from '../../StatisticProvider';
import { StatisticType, YAxisType } from '../../StatisticResolver';
import { TabPrefab, TabPrefabDataSource } from '../TabPrefab';
import { generateRowsFromStatsPrefabs } from '../utilities';

const packetDataReceived: StatisticPrefab = {
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

const packetDataSent: StatisticPrefab = {
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

const statsTab: TabPrefab = {
    name: 'Server - Bandwidth',
    dataSource: TabPrefabDataSource.Server,
    content: () => {
        return generateRowsFromStatsPrefabs([[packetDataReceived, packetDataSent]]);
    },
};

export default statsTab;
