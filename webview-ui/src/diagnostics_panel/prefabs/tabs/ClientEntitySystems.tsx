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
import { VSCodeButton, VSCodeDropdown, VSCodeOption } from '@vscode/webview-ui-toolkit/react';

const START_ENTITY_SYSTEM_PROFILER_REQUEST = 'Start Entity System Profiler';

const DEBUGGER_REQUEST_COMMANDS = [
    { command: START_ENTITY_SYSTEM_PROFILER_REQUEST, label: 'Start' },
    { command: 'Stop Entity System Profiler', label: 'Stop' },
    { command: 'Clear Entity System Profiler', label: 'Clear' },
];

type TimingUnit = 'ns' | 'us' | 'ms';

function ceilToThreeDecimalPlaces(value: number): number {
    return Math.ceil(value * 1000) / 1000;
}

function getTimingColumnLabel(unit: TimingUnit): string {
    if (unit === 'ms') {
        return 'Time In Milliseconds';
    }

    if (unit === 'us') {
        return 'Time In Microseconds';
    }

    return 'Time In Nanoseconds';
}

function formatTimingValue(value: string | number, unit: TimingUnit): string {
    const numericValue = typeof value === 'number' ? value : Number(value);

    if (!Number.isFinite(numericValue)) {
        return unit === 'ns' ? '0' : '0.000';
    }

    if (unit === 'ms') {
        return ceilToThreeDecimalPlaces(numericValue / 1_000_000).toFixed(3);
    }

    if (unit === 'us') {
        return ceilToThreeDecimalPlaces(numericValue / 1_000).toFixed(3);
    }

    return `${Math.ceil(numericValue)}`;
}

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
        const [clearResetEpoch, setClearResetEpoch] = useState(0);
        const [timingUnit, setTimingUnit] = useState<TimingUnit>('ns');

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
                                        if (command.command === 'Clear Entity System Profiler') {
                                            setClearResetEpoch(prev => prev + 1);
                                        }

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
                        <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column' }}>
                            <label htmlFor="ecs-timing-unit" style={{ marginBottom: '5px' }}>
                                Timing Unit
                            </label>
                            <VSCodeDropdown
                                id="ecs-timing-unit"
                                value={timingUnit}
                                onChange={(event: Event | React.FormEvent<HTMLElement>) => {
                                    const target = event.target as HTMLSelectElement;
                                    setTimingUnit(target.value as TimingUnit);
                                }}
                            >
                                <VSCodeOption value="ns">Nanoseconds</VSCodeOption>
                                <VSCodeOption value="us">Microseconds</VSCodeOption>
                                <VSCodeOption value="ms">Milliseconds</VSCodeOption>
                            </VSCodeDropdown>
                        </div>
                    </div>
                </div>
                <div style={{ flexDirection: 'row', display: 'flex', width: '100%' }}>
                    <div style={{ flex: 1, marginRight: '5px' }}>
                        <MinecraftMultiColumnStatisticTable
                            key={`entity-timings-${selectedClient}-${clearResetEpoch}`}
                            title="Entity Timings"
                            keyLabel="Entity"
                            valueLabels={[getTimingColumnLabel(timingUnit), 'Percent Of Total']}
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
                            columnWidths={['auto', 'auto', 'auto', '70px']}
                            prettifyNames={false}
                            rowAction={{
                                label: '🔍',
                                headerLabel: 'Focus',
                                width: '70px',
                                disabled: () => isDebuggerRequestInFlight(START_ENTITY_SYSTEM_PROFILER_REQUEST),
                                onClick: async row => {
                                    setLastRequestedCommand(START_ENTITY_SYSTEM_PROFILER_REQUEST);

                                    // given an entity name like: minecraft:arrow<> (2#262231)
                                    // we want to extract the numeric id at the end (262231 in this case) to send to the profiler
                                    const args = {
                                        entityId: row.category.split('#')[1]?.replace(')', ''),
                                    };
                                    sendDebuggerRequest(START_ENTITY_SYSTEM_PROFILER_REQUEST, args);

                                    // Wait for isDebuggerRequestInFlight to become false and then clear
                                    while (isDebuggerRequestInFlight(START_ENTITY_SYSTEM_PROFILER_REQUEST)) {
                                        await new Promise(resolve => setTimeout(resolve, 100));
                                    }
                                    setClearResetEpoch(prev => prev + 1);
                                },
                            }}
                            nonConsolidatedColumnResolver={event => resolveEcsColumn(event.id)}
                            valueFormatter={(value, columnIndex) => {
                                if (columnIndex === 0) {
                                    return formatTimingValue(value, timingUnit);
                                }

                                return typeof value === 'number' ? value.toFixed(1) : String(value);
                            }}
                        />
                    </div>
                    <div style={{ flex: 1, marginRight: '5px' }}>
                        <MinecraftMultiColumnStatisticTable
                            key={`system-timings-${selectedClient}-${clearResetEpoch}`}
                            title="System Timings"
                            keyLabel="System"
                            valueLabels={[getTimingColumnLabel(timingUnit), 'Percent Of Total']}
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
                            columnWidths={['auto', 'auto', 'auto']}
                            prettifyNames={false}
                            nonConsolidatedColumnResolver={event => resolveEcsColumn(event.id)}
                            valueFormatter={(value, columnIndex) => {
                                if (columnIndex === 0) {
                                    return formatTimingValue(value, timingUnit);
                                }

                                return typeof value === 'number' ? value.toFixed(1) : String(value);
                            }}
                        />
                    </div>
                </div>
            </div>
        );
    },
};

export default statsTab;
