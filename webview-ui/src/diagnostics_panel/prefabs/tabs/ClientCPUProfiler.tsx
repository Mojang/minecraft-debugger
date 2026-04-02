import { useMemo } from 'react';
import { MultipleStatisticProvider, StatisticUpdatedMessage } from '../../StatisticProvider';
import { TabPrefab, TabPrefabDataSource, TabPrefabParams } from '../TabPrefab';
import MinecraftProfilerFlameStreamChart from '../../controls/MinecraftProfilerFlameStreamChart';

function isWhiskerEvent(event: StatisticUpdatedMessage): boolean {
    return event.group === 'low' || event.group === 'mid' || event.group === 'high' || event.group === 'indents';
}

const StatsTab: TabPrefab = {
    name: 'Client - CPU Profiler',
    dataSource: TabPrefabDataSource.Client,
    content: ({ selectedClient }: TabPrefabParams) => {
        const statisticDataProvider = useMemo(
            () =>
                new MultipleStatisticProvider({
                    statisticParentId: new RegExp(`.*${selectedClient}.*whisker.*`),
                    valuesFilter: event =>
                        isWhiskerEvent(event) && (event.children_string_values.length > 0 || event.values.length > 0),
                }),
            [selectedClient],
        );

        return (
            <div style={{ flexDirection: 'row', display: 'flex', width: '100%' }}>
                <MinecraftProfilerFlameStreamChart
                    title="Profiler Scopes"
                    statisticDataProvider={statisticDataProvider}
                    tickRange={20 * 60}
                    defaultWindowTicks={20 * 20}
                />
            </div>
        );
    },
};

export default StatsTab;
