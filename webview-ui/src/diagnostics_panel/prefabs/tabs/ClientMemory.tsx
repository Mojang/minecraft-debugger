import MinecraftStatisticStackedLineChart from '../../controls/MinecraftStatisticStackedLineChart';
import { MultipleStatisticProvider } from '../../StatisticProvider';
import { StatisticType, YAxisType, createStatResolver } from '../../StatisticResolver';
import { TabPrefab, TabPrefabDataSource, TabPrefabParams } from '../TabPrefab';
import MinecraftStatisticTable from '../../controls/MinecraftStatisticTable';

const statsTab: TabPrefab = {
    name: 'Client - Memory',
    dataSource: TabPrefabDataSource.Client,
    content: ({ selectedClient }: TabPrefabParams) => {
        return (
            <div style={{ flexDirection: 'row', display: 'flex', width: '100%' }}>
                <div style={{ flex: 1, marginRight: '5px' }}>
                    {/* Added wrapper div with flex: 1 */}
                    <MinecraftStatisticTable
                        title="Memory Usage"
                        valueLabel="Memory Usage (MB)"
                        keyLabel="Area"
                        statisticDataProvider={
                            new MultipleStatisticProvider({
                                statisticParentId: new RegExp(`.*${selectedClient}_client_memory`),
                            })
                        }
                        statisticResolver={createStatResolver({
                            type: StatisticType.Absolute,
                            tickRange: 20 * 10,
                            yAxisType: YAxisType.Absolute,
                            valueScalar: 1 / 1000000,
                        })}
                    />
                </div>
                <div style={{ flex: 1, marginLeft: '5px' }}>
                    {/* Added wrapper div with flex: 1 */}
                    <MinecraftStatisticStackedLineChart
                        title="Memory Usage"
                        yLabel="Memory Usage (MB)"
                        statisticDataProvider={
                            new MultipleStatisticProvider({
                                statisticParentId: new RegExp(`.*${selectedClient}_client_memory`),
                            })
                        }
                        statisticResolver={createStatResolver({
                            type: StatisticType.Absolute,
                            tickRange: 20 * 10,
                            yAxisType: YAxisType.Absolute,
                            valueScalar: 1 / 1000000,
                        })}
                    />
                </div>
            </div>
        );
    },
};

export default statsTab;
