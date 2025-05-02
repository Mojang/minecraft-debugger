import MinecraftStatisticStackedLineChart from '../../controls/MinecraftStatisticStackedLineChart';
import { StatisticPrefab } from '../StatisticPrefab';
import { MultipleStatisticProvider } from '../../StatisticProvider';
import { StatisticType, YAxisType, createStatResolver } from '../../StatisticResolver';
import { TabPrefab, TabPrefabDataSource } from '../TabPrefab';
import { generateRowsFromStatsPrefabs } from '../utilities';

const serverTickTimings: StatisticPrefab = {
    name: 'Server Tick Timings',
    reactNode: (
        <MinecraftStatisticStackedLineChart
            title="Server Tick"
            statisticDataProvider={
                new MultipleStatisticProvider({
                    statisticIds: ['level_tick', 'script_tick', 'script_job_tick'],
                    statisticParentId: 'server_tick_timings',
                })
            }
            catageoryLabels={{
                level_tick: 'Level Tick',
                script_tick: 'Scripting Tick',
                script_job_tick: 'Scripting Job System',
            }}
            statisticResolver={createStatResolver({
                type: StatisticType.Absolute,
                tickRange: 20 * 10 /* About 10 seconds */,
                yAxisType: YAxisType.Absolute,
                valueScalar: 1 / 1000, // Microseconds to milliseconds
            })}
            yLabel="Server Tick Time (ms)"
            targetValue={50} // 50ms is the target for server time, 20hz
        />
    ),
};

const commandsRan: StatisticPrefab = {
    name: 'Commands Ran',
    reactNode: (
        <MinecraftStatisticStackedLineChart
            title="Commands Run"
            statisticDataProvider={
                new MultipleStatisticProvider({
                    statisticParentId: 'commands',
                })
            }
            statisticResolver={createStatResolver({
                type: StatisticType.Absolute,
                tickRange: 20 * 10 /* About 10 seconds */,
                yAxisType: YAxisType.Absolute,
            })}
            yLabel="Number of Commands"
        />
    ),
};

const statsTab: TabPrefab = {
    name: 'Server - Timings',
    dataSource: TabPrefabDataSource.Server,
    content: () => {
        return generateRowsFromStatsPrefabs([[serverTickTimings], [commandsRan]]);
    },
};

export default statsTab;
