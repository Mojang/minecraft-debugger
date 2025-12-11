import { MultipleStatisticProvider } from '../../StatisticProvider';
import { TabPrefab, TabPrefabDataSource } from '../TabPrefab';
import MinecraftMultiColumnStatisticTable from '../../controls/MinecraftMultiColumnStatisticTable';
import { createStatResolver, StatisticType, YAxisType } from '../../StatisticResolver';

const statsTab: TabPrefab = {
    name: 'Editor Network Stats',
    dataSource: TabPrefabDataSource.Server,
    content: () => {
        return (
            <div>
                <MinecraftMultiColumnStatisticTable
                    title="Editor Network Packet Statistics"
                    statisticDataProvider={
                        new MultipleStatisticProvider({
                            statisticParentId: 'editor_network_stats',
                            statisticIds: ['consolidated_data'],
                        })
                    }
                    statisticResolver={createStatResolver({
                        type: StatisticType.Absolute,
                        yAxisType: YAxisType.Absolute,
                        tickRange: 20 * 15, // About 15 seconds
                    })}
                    keyLabel="Packet Type"
                    valueLabels={['Sent Count', 'Received Count', 'Min Size', 'Max Size']}
                    prettifyNames={false} // Keep original packet name format
                    defaultSortColumn="value_0" // Sort by "Sent Count" column by default
                    columnWidths={['400px', '80px', '80px', '80px', '80px']} // Custom column widths
                />
            </div>
        );
    },
};

export default statsTab;
