import { MultipleStatisticProvider } from '../../StatisticProvider';
import { ParentNameStatResolver, StatisticType, YAxisType, createStatResolver } from '../../StatisticResolver';
import { TabPrefab, TabPrefabDataSource, TabPrefabParams } from '../TabPrefab';
import MinecraftMultiColumnStatisticTable, {
    MinecraftMultiColumnStatisticTableSortOrder,
    MinecraftMultiColumnStatisticTableSortType,
} from '../../controls/MinecraftMultiColumnStatisticTable';

function resolveEcsColumn(eventId: string): number | undefined {
    switch (eventId) {
        case 'time_in_ns':
            return 0;
        case 'percent_of_total':
            return 1;
        default:
            return undefined;
    }
}

const statsTab: TabPrefab = {
    name: 'Client - Entity Systems',
    dataSource: TabPrefabDataSource.Client,
    content: ({ selectedClient }: TabPrefabParams) => {
        return (
            <div style={{ flexDirection: 'column', display: 'flex', width: '100%' }}>
                <label style={{ fontSize: '14px', fontStyle: 'italic', marginTop: '10px' }}>
                    Entity and System timings can be collected by enabling the profiler with the `/ecsprof start`
                    command.
                </label>
                <div style={{ flex: 1, marginRight: '5px' }}>
                    <MinecraftMultiColumnStatisticTable
                        title="Entity Timings"
                        keyLabel="Entity"
                        valueLabels={['Time In Nanoseconds', 'Percent Of Total']}
                        statisticDataProvider={
                            new MultipleStatisticProvider({
                                statisticIds: ['time_in_ns', 'percent_of_total'],
                                statisticParentId: new RegExp(`.*${selectedClient}_client_ecs_entities`),
                            })
                        }
                        statisticResolver={ParentNameStatResolver(
                            createStatResolver({
                                type: StatisticType.Absolute,
                                tickRange: 20 * 10,
                                yAxisType: YAxisType.Absolute,
                                valueScalar: 1,
                            }),
                        )}
                        defaultSortColumn="value_1"
                        defaultSortOrder={MinecraftMultiColumnStatisticTableSortOrder.Descending}
                        defaultSortType={MinecraftMultiColumnStatisticTableSortType.Numerical}
                        columnWidths={['auto', 'auto']}
                        prettifyNames={false}
                        nonConsolidatedColumnResolver={event => resolveEcsColumn(event.id)}
                    />
                </div>
                <div style={{ flex: 1, marginRight: '5px' }}>
                    <MinecraftMultiColumnStatisticTable
                        title="System Timings"
                        keyLabel="System"
                        valueLabels={['Time In Nanoseconds', 'Percent Of Total']}
                        statisticDataProvider={
                            new MultipleStatisticProvider({
                                statisticIds: ['time_in_ns', 'percent_of_total'],
                                statisticParentId: new RegExp(`.*${selectedClient}_client_ecs_systems`),
                            })
                        }
                        statisticResolver={ParentNameStatResolver(
                            createStatResolver({
                                type: StatisticType.Absolute,
                                tickRange: 20 * 10,
                                yAxisType: YAxisType.Absolute,
                                valueScalar: 1,
                            }),
                        )}
                        defaultSortColumn="value_1"
                        defaultSortOrder={MinecraftMultiColumnStatisticTableSortOrder.Descending}
                        defaultSortType={MinecraftMultiColumnStatisticTableSortType.Numerical}
                        columnWidths={['auto', 'auto']}
                        prettifyNames={false}
                        nonConsolidatedColumnResolver={event => resolveEcsColumn(event.id)}
                    />
                </div>
            </div>
        );
    },
};

export default statsTab;
