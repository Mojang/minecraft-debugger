import MinecraftStatisticStackedLineChart from '../../controls/MinecraftStatisticStackedLineChart';
import { StatisticPrefab } from '../StatisticPrefab';
import { MultipleStatisticProvider } from '../../StatisticProvider';
import { StatisticType, YAxisType, createStatResolver } from '../../StatisticResolver';
import { TabPrefab, TabPrefabDataSource } from '../TabPrefab';
import { generateRowsFromStatsPrefabs } from '../utilities';

const SERVER_TICK_TIMINGS_COLLECTOR = 'server_tick_timings';
const COMMANDS_COLLECTOR = 'commands';

const ServerTickTimings: StatisticPrefab = {
    name: 'Server Tick Timings',
    collectorName: SERVER_TICK_TIMINGS_COLLECTOR,
    reactNode: (
        <MinecraftStatisticStackedLineChart
            title="Server Tick"
            statisticDataProvider={
                new MultipleStatisticProvider({
                    statisticIds: ['level_tick', 'script_tick', 'script_job_tick'],
                    statisticParentId: SERVER_TICK_TIMINGS_COLLECTOR,
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

const CommandsRan: StatisticPrefab = {
    name: 'Commands Ran',
    collectorName: COMMANDS_COLLECTOR,
    reactNode: (
        <MinecraftStatisticStackedLineChart
            title="Commands Run"
            statisticDataProvider={
                new MultipleStatisticProvider({
                    statisticParentId: COMMANDS_COLLECTOR,
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

const StatsTab: TabPrefab = {
    name: 'Server - Timings',
    dataSource: TabPrefabDataSource.Server,
    collectors: [ServerTickTimings, CommandsRan],
    content: () => {
        return generateRowsFromStatsPrefabs([[ServerTickTimings], [CommandsRan]]);
    },
};

export default StatsTab;
