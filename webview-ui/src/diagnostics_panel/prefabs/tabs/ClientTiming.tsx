import MinecraftStatisticStackedLineChart from '../../controls/MinecraftStatisticStackedLineChart';
import { MultipleStatisticProvider, SimpleStatisticProvider } from '../../StatisticProvider';
import { StatisticType, YAxisType, createStatResolver } from '../../StatisticResolver';
import { TabPrefab, TabPrefabDataSource, TabPrefabParams } from '../TabPrefab';
import MinecraftStatisticLineChart from '../../controls/MinecraftStatisticLineChart';

const statsTab: TabPrefab = {
    name: 'Client - Timings',
    dataSource: TabPrefabDataSource.Client,
    content: ({ selectedClient }: TabPrefabParams) => {
        return (
            <div style={{ flexDirection: 'column' }}>
                <MinecraftStatisticLineChart
                    title="FPS"
                    yLabel="FPS"
                    statisticDataProvider={
                        new SimpleStatisticProvider({
                            statisticId: 'avg_fps',
                            statisticParentId: new RegExp(`.*${selectedClient}_client_frame_timings`),
                        })
                    }
                    statisticOptions={{
                        type: StatisticType.Absolute,
                        yAxisType: YAxisType.Absolute,
                        tickRange: 20 * 10,
                    }}
                />
                <MinecraftStatisticStackedLineChart
                    title="Frame Timings"
                    yLabel="Frame Times (ms)"
                    statisticDataProvider={
                        new MultipleStatisticProvider({
                            statisticIds: [
                                'avg_server_simtick_time',
                                'avg_client_simtick_time',
                                'avg_begin_frame_time',
                                'avg_input_time',
                                'avg_render_time',
                                'avg_end_frame_time',
                            ],
                            statisticParentId: new RegExp(`.*${selectedClient}_client_frame_timings`),
                        })
                    }
                    catageoryLabels={{
                        avg_server_simtick_time: 'Server Simtick Time',
                        avg_client_simtick_time: 'Client Simtick Time',
                        avg_begin_frame_time: 'Begin Frame Time',
                        avg_input_time: 'Input Time',
                        avg_render_time: 'Render Time',
                        avg_end_frame_time: 'End Frame Time',
                    }}
                    statisticResolver={createStatResolver({
                        type: StatisticType.Absolute,
                        tickRange: 20 * 10,
                        yAxisType: YAxisType.Absolute,
                        valueScalar: 1 / 1000,
                    })}
                />
            </div>
        );
    },
};

export default statsTab;
