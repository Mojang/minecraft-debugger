import { MultipleStatisticProvider } from '../../StatisticProvider';
import { ParentNameStatResolver, StatisticType, YAxisType, createStatResolver } from '../../StatisticResolver';
import { TabPrefab, TabPrefabDataSource, TabPrefabParams } from '../TabPrefab';
import MinecraftMultiColumnStatisticTable, {
    MinecraftMultiColumnStatisticTableSortOrder,
    MinecraftMultiColumnStatisticTableSortType,
} from '../../controls/MinecraftMultiColumnStatisticTable';
import {
    DebuggerRequestResultMessage,
    getDebuggerRequestResult,
    isDebuggerRequestInFlight,
    sendDebuggerRequest,
    useDebuggerRequestUpdates,
} from '../../utilities/useDebuggerRequests';
import { useState } from 'react';
import { VSCodeButton } from '@vscode/webview-ui-toolkit/react';

const DEBUGGER_REQUEST_COMMANDS = [
    { command: 'Start Entity System Profiler', label: 'Start' },
    { command: 'Stop Entity System Profiler', label: 'Stop' },
    { command: 'Clear Entity System Profiler', label: 'Clear' },
];

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

function lastResultToUserFriendlyString(lastResult: DebuggerRequestResultMessage): string {
    if (lastResult.error) {
        return `Error: ${lastResult.error}`;
    } else if (lastResult.response) {
        if (lastResult.response.success) {
            return `${lastResult.response.response_message}`;
        } else {
            return `Failed: ${lastResult.response.response_message}`;
        }
    } else {
        return 'Press Start to Begin Profiling';
    }
}

const statsTab: TabPrefab = {
    name: 'Client - Entity Systems',
    dataSource: TabPrefabDataSource.Client,
    content: ({ selectedClient }: TabPrefabParams) => {
        useDebuggerRequestUpdates();
        const [lastRequestedCommand, setLastRequestedCommand] = useState<string>('');

        const lastResult: DebuggerRequestResultMessage | undefined = lastRequestedCommand
            ? getDebuggerRequestResult(lastRequestedCommand)
            : undefined;

        return (
            <div>
                <div style={{ flexDirection: 'column', display: 'flex', width: '25%' }}>
                    <div style={{ flex: 1, margin: '5px' }}>
                        <h2>Entity System Profiler Controls</h2>
                        {DEBUGGER_REQUEST_COMMANDS.map(command => {
                            const inFlight = isDebuggerRequestInFlight(command.command);
                            return (
                                <VSCodeButton
                                    key={command.command}
                                    disabled={inFlight}
                                    onClick={() => {
                                        setLastRequestedCommand(command.command);
                                        sendDebuggerRequest(command.command);
                                    }}
                                    style={{ margin: '5px' }}
                                >
                                    {command.label}
                                </VSCodeButton>
                            );
                        })}
                        <div style={{ marginTop: '20px' }}>
                            <text style={{ fontStyle: 'italic' }}>
                                {lastResult
                                    ? lastResultToUserFriendlyString(lastResult)
                                    : 'Press Start to Begin Profiling'}
                            </text>
                        </div>
                    </div>
                </div>
                <div style={{ flexDirection: 'row', display: 'flex', width: '100%' }}>
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
            </div>
        );
    },
};

export default statsTab;
