import { SimpleStatisticProvider } from '../../StatisticProvider';
import { StatisticType, YAxisType } from '../../StatisticResolver';
import { TabPrefab, TabPrefabDataSource, TabPrefabParams } from '../TabPrefab';
import MinecraftStatisticLineChart from '../../controls/MinecraftStatisticLineChart';

const statsTab: TabPrefab = {
    name: 'Server - Scripting Handle Counts',
    dataSource: TabPrefabDataSource.ServerScript,
    content: ({ selectedPlugin }: TabPrefabParams) => {
        return (
            <div style={{ flexDirection: 'column' }}>
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
            </div>
        );
    },
};

export default statsTab;
