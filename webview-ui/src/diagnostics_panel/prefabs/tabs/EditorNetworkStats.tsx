import { useMemo } from 'react';
import { MultipleStatisticProvider } from '../../StatisticProvider';
import { TabPrefab, TabPrefabDataSource } from '../TabPrefab';
import MinecraftMultiColumnStatisticTable from '../../controls/MinecraftMultiColumnStatisticTable';
import { createStatResolver, StatisticType, YAxisType } from '../../StatisticResolver';

const statsTab: TabPrefab = {
    name: 'Editor Network Stats',
    dataSource: TabPrefabDataSource.Server,
    content: props => {
        const actions = useMemo(
            () => [
                { label: 'Reset', onClick: () => props.onRunCommand(getPayloadMetricsCommandStr('clear')) },
                { label: 'Pause', onClick: () => props.onRunCommand(getPayloadMetricsCommandStr('pause')) },
                {
                    label: 'Resume',
                    onClick: () => props.onRunCommand(getPayloadMetricsCommandStr('resume')),
                },
            ],
            [props.onRunCommand],
        );

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
                    actions={actions}
                    keyLabel="Packet Type"
                    valueLabels={[
                        'Sent Count',
                        'Received Count',
                        'Sent Total Size',
                        'Received Total Size',
                        'Min Size',
                        'Max Size',
                    ]}
                    prettifyNames={false} // Keep original packet name format
                    defaultSortColumn="value_0" // Sort by "Sent Count" column by default
                    columnWidths={['400px', '80px', '80px', '80px', '80px', '80px', '80px']} // Custom column widths
                />
            </div>
        );
    },
};

function getPayloadMetricsCommandStr(command: 'clear' | 'pause' | 'resume'): string {
    return `/editorservertest payloadmetrics ${command}`;
}

export default statsTab;
