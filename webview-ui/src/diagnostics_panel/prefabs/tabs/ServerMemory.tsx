import MinecraftStatisticLineChart from '../../controls/MinecraftStatisticLineChart';
import { StatisticPrefab } from '../StatisticPrefab';
import { SimpleStatisticProvider } from '../../StatisticProvider';
import { StatisticType, YAxisType } from '../../StatisticResolver';
import { TabPrefab, TabPrefabDataSource } from '../TabPrefab';
import { generateRowsFromStatsPrefabs } from '../utilities';

const APP_MEMORY_COLLECTOR = 'app_memory';
const RUNTIME_MEMORY_COLLECTOR = 'runtime_memory';

const AppMemoryUsage: StatisticPrefab = {
    name: 'App Memory Usage',
    collectorName: APP_MEMORY_COLLECTOR,
    reactNode: (
        <MinecraftStatisticLineChart
            title="App Memory Used"
            yLabel="Memory (MB)"
            statisticDataProvider={
                new SimpleStatisticProvider({ statisticId: 'used', statisticParentId: APP_MEMORY_COLLECTOR })
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

const AppMemoryFree: StatisticPrefab = {
    name: 'App Memory Free',
    collectorName: APP_MEMORY_COLLECTOR,
    reactNode: (
        <MinecraftStatisticLineChart
            title="App Memory Free"
            yLabel="Memory (MB)"
            statisticDataProvider={
                new SimpleStatisticProvider({ statisticId: 'free', statisticParentId: APP_MEMORY_COLLECTOR })
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

const JavaScriptMemoryUsed: StatisticPrefab = {
    name: 'JavaScript Memory Used',
    collectorName: RUNTIME_MEMORY_COLLECTOR,
    reactNode: (
        <MinecraftStatisticLineChart
            title="JavaScript Memory Used"
            yLabel="Memory Used (MB)"
            statisticDataProvider={
                new SimpleStatisticProvider({
                    statisticId: 'used',
                    statisticParentId: RUNTIME_MEMORY_COLLECTOR,
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

const JavaScriptMemoryAllocated: StatisticPrefab = {
    name: 'JavaScript Memory Free',
    collectorName: RUNTIME_MEMORY_COLLECTOR,
    reactNode: (
        <MinecraftStatisticLineChart
            title="JavaScript Memory Allocated"
            yLabel="Memory Used (MB)"
            statisticDataProvider={
                new SimpleStatisticProvider({
                    statisticId: 'allocated',
                    statisticParentId: RUNTIME_MEMORY_COLLECTOR,
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

const StatsTab: TabPrefab = {
    name: 'Server - Memory',
    dataSource: TabPrefabDataSource.Server,
    collectors: [AppMemoryUsage, AppMemoryFree, JavaScriptMemoryAllocated, JavaScriptMemoryUsed],
    content: () => {
        return generateRowsFromStatsPrefabs([
            [AppMemoryUsage, AppMemoryFree],
            [JavaScriptMemoryAllocated, JavaScriptMemoryUsed],
        ]);
    },
};

export default StatsTab;
