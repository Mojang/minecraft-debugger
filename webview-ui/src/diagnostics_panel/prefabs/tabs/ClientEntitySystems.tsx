import { MultipleStatisticProvider } from '../../StatisticProvider';
import { ParentNameStatResolver, StatisticType, YAxisType, createStatResolver } from '../../StatisticResolver';
import { TabPrefab, TabPrefabDataSource, TabPrefabParams } from '../TabPrefab';
import MinecraftGroupedStatisticTable, {
    MinecraftGroupedStatisticTableColumnAggregation,
    MinecraftGroupedStatisticTableDisplayMode,
    MinecraftGroupedStatisticTableSortOrder,
    MinecraftGroupedStatisticTableSortType,
} from '../../controls/MinecraftGroupedStatisticTable';
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
type EntityViewMode = 'flat' | 'grouped';

function ceilToDecimalPlace(value: number, decimalPlaces: number): string {
    return (Math.ceil(value * Math.pow(10, decimalPlaces)) / Math.pow(10, decimalPlaces)).toFixed(decimalPlaces);
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

function formatTimingValue(value: number, unit: TimingUnit): string {
    if (!Number.isFinite(value)) {
        return `0 ${unit}`;
    }

    if (unit === 'ms') {
        return `${ceilToDecimalPlace(value / 1_000_000, 3)} ms`;
    }

    if (unit === 'us') {
        return `${ceilToDecimalPlace(value / 1_000, 1)} us`;
    }

    return `${value} ns`;
}

function formatPercentageValue(value: number): string {
    if (!Number.isFinite(value)) {
        return '0 %';
    }

    return `${ceilToDecimalPlace(value, 0)} %`;
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

function resolveEntityTypeGroupKey(fullName: string): string {
    // Example fullName: "minecraft:entity_name<> (2:12345)"
    // First remove anything after the first '<'
    let groupName = fullName ? fullName.split('<')[0] : 'NULL';
    // Then account for the case we don't have the '<>' and remove anything after the first '('
    groupName = groupName ? groupName.split('(')[0] : 'NULL';
    return groupName;
}

function extractEntityId(entityCategory: string): string | undefined {
    const match = entityCategory.match(/[#:](\d+)\)\s*$/);
    return match?.[1];
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
        const [entityTimingUnit, setEntityTimingUnit] = useState<TimingUnit>('ms');
        const [systemTimingUnit, setSystemTimingUnit] = useState<TimingUnit>('us');
        const [entityViewMode, setEntityViewMode] = useState<EntityViewMode>('grouped');

        const entityValueLabels = [getTimingColumnLabel(entityTimingUnit), 'Percent Of Total'];

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
                    </div>
                </div>
                <div style={{ flexDirection: 'row', display: 'flex', width: '90%' }}>
                    <div style={{ flex: 1, marginRight: '5px' }}>
                        <div style={{ marginTop: '10px', marginBottom: '10px' }}>
                            <h2>Entity Timings</h2>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                                <div className="dropdown-container">
                                    <label htmlFor="ecs-entity-timing-unit" style={{ marginBottom: '5px' }}>
                                        Entity Timing Unit
                                    </label>
                                    <VSCodeDropdown
                                        id="ecs-entity-timing-unit"
                                        value={entityTimingUnit}
                                        onChange={(event: Event | React.FormEvent<HTMLElement>) => {
                                            const target = event.target as HTMLSelectElement;
                                            setEntityTimingUnit(target.value as TimingUnit);
                                        }}
                                    >
                                        <VSCodeOption value="ns">Nanoseconds</VSCodeOption>
                                        <VSCodeOption value="us">Microseconds</VSCodeOption>
                                        <VSCodeOption value="ms">Milliseconds</VSCodeOption>
                                    </VSCodeDropdown>
                                </div>
                                <div className="dropdown-container">
                                    <label htmlFor="ecs-entity-view-mode" style={{ marginBottom: '5px' }}>
                                        Entity View
                                    </label>
                                    <VSCodeDropdown
                                        id="ecs-entity-view-mode"
                                        value={entityViewMode}
                                        onChange={(event: Event | React.FormEvent<HTMLElement>) => {
                                            const target = event.target as HTMLSelectElement;
                                            setEntityViewMode(target.value as EntityViewMode);
                                        }}
                                    >
                                        <VSCodeOption value="grouped">Grouped</VSCodeOption>
                                        <VSCodeOption value="flat">Flat</VSCodeOption>
                                    </VSCodeDropdown>
                                </div>
                            </div>
                        </div>

                        <MinecraftGroupedStatisticTable
                            key={`entity-timings-${entityViewMode}-${selectedClient}-${clearResetEpoch}`}
                            title="Entity Timings"
                            showTitle={false}
                            keyLabel="Entity"
                            valueLabels={entityValueLabels}
                            displayMode={
                                entityViewMode === 'grouped'
                                    ? MinecraftGroupedStatisticTableDisplayMode.Grouped
                                    : MinecraftGroupedStatisticTableDisplayMode.Flat
                            }
                            groupColumnAggregations={[
                                MinecraftGroupedStatisticTableColumnAggregation.Average,
                                MinecraftGroupedStatisticTableColumnAggregation.Sum,
                            ]}
                            getGroupKey={resolveEntityTypeGroupKey}
                            groupCountLabel="entities"
                            defaultCollapsed={true}
                            defaultSortColumn="value_1"
                            defaultSortOrder={MinecraftGroupedStatisticTableSortOrder.Descending}
                            defaultSortType={MinecraftGroupedStatisticTableSortType.Numerical}
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
                            rowAction={{
                                label: '🔍',
                                headerLabel: 'Focus',
                                width: '70px',
                                disabled: () => isDebuggerRequestInFlight(START_ENTITY_SYSTEM_PROFILER_REQUEST),
                                onClick: async row => {
                                    const entityId = extractEntityId(row.category);
                                    if (!entityId) {
                                        return;
                                    }

                                    setLastRequestedCommand(START_ENTITY_SYSTEM_PROFILER_REQUEST);

                                    const args = {
                                        entityId,
                                    };
                                    sendDebuggerRequest(START_ENTITY_SYSTEM_PROFILER_REQUEST, args);

                                    while (isDebuggerRequestInFlight(START_ENTITY_SYSTEM_PROFILER_REQUEST)) {
                                        await new Promise(resolve => setTimeout(resolve, 100));
                                    }
                                    setClearResetEpoch(prev => prev + 1);
                                },
                            }}
                            nonConsolidatedColumnResolver={event => resolveEcsColumn(event.id)}
                            valueFormatter={(value, columnIndex) => {
                                // Timing column
                                if (columnIndex === 0) {
                                    return formatTimingValue(Number(value), entityTimingUnit);
                                }
                                // Percentage column
                                else if (columnIndex === 1) {
                                    return formatPercentageValue(Number(value));
                                }

                                return String(value);
                            }}
                        />
                    </div>
                    <div style={{ flex: 1, marginRight: '5px' }}>
                        <div style={{ marginTop: '10px', marginBottom: '10px' }}>
                            <h2>System Timings</h2>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                                <div className="dropdown-container">
                                    <label htmlFor="ecs-system-timing-unit" style={{ marginBottom: '5px' }}>
                                        System Timing Unit
                                    </label>
                                    <VSCodeDropdown
                                        id="ecs-system-timing-unit"
                                        value={systemTimingUnit}
                                        onChange={(event: Event | React.FormEvent<HTMLElement>) => {
                                            const target = event.target as HTMLSelectElement;
                                            setSystemTimingUnit(target.value as TimingUnit);
                                        }}
                                    >
                                        <VSCodeOption value="ns">Nanoseconds</VSCodeOption>
                                        <VSCodeOption value="us">Microseconds</VSCodeOption>
                                        <VSCodeOption value="ms">Milliseconds</VSCodeOption>
                                    </VSCodeDropdown>
                                </div>
                            </div>
                        </div>
                        <MinecraftGroupedStatisticTable
                            key={`system-timings-${selectedClient}-${clearResetEpoch}`}
                            title="System Timings"
                            showTitle={false}
                            keyLabel="System"
                            valueLabels={[getTimingColumnLabel(systemTimingUnit), 'Percent Of Total']}
                            displayMode={MinecraftGroupedStatisticTableDisplayMode.Flat}
                            groupColumnAggregations={[
                                MinecraftGroupedStatisticTableColumnAggregation.Average,
                                MinecraftGroupedStatisticTableColumnAggregation.Sum,
                            ]}
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
                            defaultSortOrder={MinecraftGroupedStatisticTableSortOrder.Descending}
                            defaultSortType={MinecraftGroupedStatisticTableSortType.Numerical}
                            prettifyNames={false}
                            nonConsolidatedColumnResolver={event => resolveEcsColumn(event.id)}
                            valueFormatter={(value, columnIndex) => {
                                // Timing column
                                if (columnIndex === 0) {
                                    return formatTimingValue(Number(value), systemTimingUnit);
                                }
                                // Percentage column
                                else if (columnIndex === 1) {
                                    return formatPercentageValue(Number(value));
                                }

                                return String(value);
                            }}
                        />
                    </div>
                </div>
            </div>
        );
    },
};

export default statsTab;
