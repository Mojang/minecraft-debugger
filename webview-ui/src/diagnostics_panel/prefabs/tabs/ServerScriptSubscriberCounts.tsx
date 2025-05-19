import { MultipleStatisticProvider, StatisticUpdatedMessage } from '../../StatisticProvider';
import { createStatResolver, StatisticType, YAxisType } from '../../StatisticResolver';
import { TabPrefab, TabPrefabDataSource, TabPrefabParams } from '../TabPrefab';
import MinecraftStatisticStackedBarChart from '../../controls/MinecraftStatisticStackedBarChart';

// Filter out events with a value of zero that haven't been previously subscribed to
function constructSubscribedSignalFilter() {
    const nonFilteredValues: string[] = [];
    const func = (event: StatisticUpdatedMessage) => {
        if (event.values.length === 1 && event.values[0] === 0 && !nonFilteredValues.includes(event.id)) {
            return false;
        }
        nonFilteredValues.push(event.id);
        return true;
    };
    return func;
}

const statsTab: TabPrefab = {
    name: 'Server - Scripting Subscriber Counts',
    dataSource: TabPrefabDataSource.ServerScript,
    content: ({ selectedPlugin }: TabPrefabParams) => {
        return (
            <div style={{ flexDirection: 'column' }}>
                <MinecraftStatisticStackedBarChart
                    title="Signal Subscribers"
                    yLabel="Number of World and System Before and After Event Subscribers Broken Down By Signal"
                    statisticDataProvider={
                        new MultipleStatisticProvider({
                            statisticParentId: new RegExp(`fine_grained_subscribers_${selectedPlugin}`),
                            valuesFilter: constructSubscribedSignalFilter(),
                        })
                    }
                    statisticResolver={createStatResolver({
                        type: StatisticType.Absolute,
                        tickRange: 20 * 15 /* About 15 seconds */,
                        yAxisType: YAxisType.Absolute,
                    })}
                />
            </div>
        );
    },
};

export default statsTab;
