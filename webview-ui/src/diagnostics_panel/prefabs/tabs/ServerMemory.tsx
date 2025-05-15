import MinecraftStatisticLineChart from '../../controls/MinecraftStatisticLineChart';
import { StatisticPrefab } from '../StatisticPrefab';
import { SimpleStatisticProvider } from '../../StatisticProvider';
import { StatisticType, YAxisType } from '../../StatisticResolver';
import { TabPrefab, TabPrefabDataSource } from '../TabPrefab';
import { generateRowsFromStatsPrefabs } from '../utilities';

const appMemoryUsage: StatisticPrefab = {
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

const appMemoryFree: StatisticPrefab = {
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

const javaScriptMemoryFree: StatisticPrefab = {
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

const javaScriptMemoryAllocated: StatisticPrefab = {
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

const statsTab: TabPrefab = {
    name: 'Server - Memory',
    dataSource: TabPrefabDataSource.Server,
    content: () => {
        return generateRowsFromStatsPrefabs([
            [appMemoryUsage, appMemoryFree],
            [javaScriptMemoryAllocated, javaScriptMemoryFree],
        ]);
    },
};

export default statsTab;
