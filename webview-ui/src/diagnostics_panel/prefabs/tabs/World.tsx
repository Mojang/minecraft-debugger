import MinecraftStatisticLineChart from '../../controls/MinecraftStatisticLineChart';
import MinecraftStatisticStackedLineChart from '../../controls/MinecraftStatisticStackedLineChart';
import { StatisticPrefab } from '../StatisticPrefab';
import { SimpleStatisticProvider, NestedStatisticProvider } from '../../StatisticProvider';
import { StatisticType, YAxisType, NestedStatResolver, createStatResolver } from '../../StatisticResolver';
import { TabPrefab, TabPrefabDataSource } from '../TabPrefab';
import { generateRowsFromStatsPrefabs } from '../utilities';

const entityCount: StatisticPrefab = {
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

const loadedChunks: StatisticPrefab = {
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

const statsTab: TabPrefab = {
    name: 'World',
    dataSource: TabPrefabDataSource.Server,
    content: () => {
        return generateRowsFromStatsPrefabs([[entityCount], [loadedChunks]]);
    },
};

export default statsTab;
