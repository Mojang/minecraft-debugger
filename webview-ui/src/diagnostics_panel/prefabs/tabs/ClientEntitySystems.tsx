// Copyright (C) Microsoft Corporation.  All rights reserved.

import { ParentNameStatResolver, StatisticType, YAxisType, createStatResolver } from '../../StatisticResolver';
import { TabPrefab, TabPrefabDataSource, TabPrefabParams } from '../TabPrefab';
import MinecraftGroupedStatisticTable, {
    MinecraftGroupedStatisticTableColumnAggregation,
    MinecraftGroupedStatisticTableDisplayMode,
    MinecraftGroupedStatisticTableHandle,
    MinecraftGroupedStatisticTableSelectionSnapshot,
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
import { DebuggerRequestResultBanner } from '../../controls/DebuggerRequestResult';
import { MultipleStatisticProvider, StatisticUpdatedMessage } from '../../StatisticProvider';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { VSCodeButton, VSCodeDropdown, VSCodeOption } from '@vscode/webview-ui-toolkit/react';

const START_ENTITY_SYSTEM_PROFILER_REQUEST = 'Start Entity System Profiler';
const FILTER_MULTI_ENTITY_REQUEST = 'Filter Multi Entity System Profiler';
const FILTER_SINGLE_ENTITY_REQUEST = 'Filter Single Entity System Profiler';
const FILTER_BY_SYSTEM_REQUEST = 'Filter By System Entity System Profiler';

const DEBUGGER_REQUEST_COMMANDS = [
    { command: START_ENTITY_SYSTEM_PROFILER_REQUEST, label: 'Start' },
    { command: 'Stop Entity System Profiler', label: 'Stop' },
    { command: 'Clear Entity System Profiler', label: 'Clear' },
];

type TimingUnit = 'ns' | 'us' | 'ms';
type EntityViewMode = 'flat' | 'grouped';
type SystemViewMode = 'flat' | 'grouped';
type FilterSelectionMode = 'no-filter' | 'filter-by-entity' | 'filter-by-single-entity' | 'filter-by-system';

const UNCATEGORIZED_SYSTEM_GROUP = 'INVALID CATEGORY';

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

function resolveSystemId(fullName: string): string | undefined {
    // Example fullname: "System Name (4)"
    const indexAndBracket = fullName ? fullName.split('(')[1] : undefined;
    const index = indexAndBracket ? indexAndBracket.split(')')[0].trim() : undefined;
    return index;
}

function resolveSystemCategoryGroupKey(fullName: string, systemCategoryLegendMap: Map<string, string>): string {
    // Example fullName: "System Name (4)"
    // Take anything before the first '('
    const indexAndBracket = fullName ? fullName.split('(')[1] : undefined;
    const index = indexAndBracket ? indexAndBracket.split(')')[0].trim() : undefined;
    // Then lookup the category name from the legend map if it exists
    return index ? systemCategoryLegendMap.get(index) || UNCATEGORIZED_SYSTEM_GROUP : UNCATEGORIZED_SYSTEM_GROUP;
}

const StatsTab: TabPrefab = {
    name: 'Client - Entity Systems',
    dataSource: TabPrefabDataSource.Client,
    content: ({ selectedClient }: TabPrefabParams) => {
        useDebuggerRequestUpdates();
        const [lastRequestedCommand, setLastRequestedCommand] = useState<string>('');
        const [entityTimingUnit, setEntityTimingUnit] = useState<TimingUnit>('ms');
        const [systemTimingUnit, setSystemTimingUnit] = useState<TimingUnit>('us');
        const [entityViewMode, setEntityViewMode] = useState<EntityViewMode>('grouped');
        const [systemViewMode, setSystemViewMode] = useState<SystemViewMode>('grouped');
        const [systemCategoryLegendMap, setSystemCategoryLegendMap] = useState<Map<string, string>>(new Map());
        const [filterSelectionMode, setFilterSelectionMode] = useState<FilterSelectionMode>('no-filter');
        const [availableEntities, setAvailableEntities] = useState<{ id: string; fullName: string }[]>([]);
        const [selectedSingleEntityId, setSelectedSingleEntityId] = useState<string | undefined>(undefined);
        const [filteredEntityCount, setFilteredEntityCount] = useState<number | undefined>(undefined);
        const [filteredSystemCount, setFilteredSystemCount] = useState<number | undefined>(undefined);
        const entityTimingsTableRef = useRef<MinecraftGroupedStatisticTableHandle | null>(null);
        const isMountRef = useRef(true);
        const categoriesProvider = useMemo(() => {
            if (!selectedClient) {
                return undefined;
            }

            return new MultipleStatisticProvider({
                statisticParentId: new RegExp(`${selectedClient}_client_ecs_categories`),
            });
        }, [selectedClient]);

        const entityIdsProvider = useMemo(() => {
            if (!selectedClient) {
                return undefined;
            }

            return new MultipleStatisticProvider({
                statisticIds: ['time_in_ns'],
                statisticParentId: new RegExp(`${selectedClient}_client_ecs_entities`),
            });
        }, [selectedClient]);

        useEffect(() => {
            setSystemCategoryLegendMap(new Map());

            if (!selectedClient || !categoriesProvider) {
                return;
            }

            const eventHandler = (event: StatisticUpdatedMessage): void => {
                const nameAndIndex = event.group_name;
                const name = nameAndIndex.split('(')[0].trim();
                const index = nameAndIndex.split('(')[1]?.split(')')[0].trim();

                if (index && name) {
                    setSystemCategoryLegendMap(prev => {
                        const newMap = new Map(prev);
                        newMap.set(index, name);
                        return newMap;
                    });
                }
            };

            categoriesProvider.registerWindowListener(window);
            categoriesProvider.addSubscriber(eventHandler);

            return () => {
                categoriesProvider.removeSubscriber(eventHandler);
                categoriesProvider.unregisterWindowListener(window);
            };
        }, [categoriesProvider, selectedClient]);

        useEffect(() => {
            setAvailableEntities([]);
            setSelectedSingleEntityId(undefined);

            if (!entityIdsProvider) {
                return;
            }

            const seenIds = new Set<string>();

            const eventHandler = (event: StatisticUpdatedMessage): void => {
                const entityId = extractEntityId(event.group_name);
                if (entityId && !seenIds.has(entityId)) {
                    seenIds.add(entityId);
                    setAvailableEntities(prev => [...prev, { id: entityId, fullName: event.group_name }]);
                }
            };

            entityIdsProvider.registerWindowListener(window);
            entityIdsProvider.addSubscriber(eventHandler);

            return () => {
                entityIdsProvider.removeSubscriber(eventHandler);
                entityIdsProvider.unregisterWindowListener(window);
            };
        }, [entityIdsProvider]);

        useEffect(() => {
            if (isMountRef.current) {
                isMountRef.current = false;
                return;
            }

            entityTimingsTableRef.current?.clearSelection();
            setSelectedSingleEntityId(undefined);
            setFilteredEntityCount(undefined);
            setFilteredSystemCount(undefined);

            setLastRequestedCommand(START_ENTITY_SYSTEM_PROFILER_REQUEST);
            sendDebuggerRequest(START_ENTITY_SYSTEM_PROFILER_REQUEST, {});
        }, [filterSelectionMode]);

        const handleEntitySelectionChange = useCallback(
            (snapshot: MinecraftGroupedStatisticTableSelectionSnapshot): void => {
                const entityIds = Array.from(
                    new Set(
                        snapshot.resolvedSelectedRows
                            .map(row => extractEntityId(row.category))
                            .filter((entityId): entityId is string => entityId !== undefined),
                    ),
                );

                setFilteredEntityCount(entityIds.length);
                setLastRequestedCommand(FILTER_MULTI_ENTITY_REQUEST);
                sendDebuggerRequest(FILTER_MULTI_ENTITY_REQUEST, { entityIds });
            },
            [filterSelectionMode],
        );

        const handleSystemSelectionChange = useCallback(
            (snapshot: MinecraftGroupedStatisticTableSelectionSnapshot): void => {
                const systemIds = Array.from(
                    new Set(
                        snapshot.resolvedSelectedRows
                            .map(row => resolveSystemId(row.category))
                            .filter((systemId): systemId is string => systemId !== undefined),
                    ),
                );

                setFilteredSystemCount(systemIds.length);
                setLastRequestedCommand(FILTER_BY_SYSTEM_REQUEST);
                sendDebuggerRequest(FILTER_BY_SYSTEM_REQUEST, { systemIds });
            },
            [filterSelectionMode],
        );

        const entityValueLabels = [getTimingColumnLabel(entityTimingUnit), 'Percent Of Total'];

        const filteredEntityLabel = (() => {
            if (filterSelectionMode === 'filter-by-single-entity') {
                return selectedSingleEntityId ? 'Showing System Timings For 1 Entity' : 'Showing All System Timings';
            }
            if (
                filterSelectionMode === 'filter-by-entity' &&
                filteredEntityCount !== undefined &&
                filteredEntityCount > 0
            ) {
                return `Showing System Timings For ${filteredEntityCount} ${filteredEntityCount === 1 ? 'Entity' : 'Entities'}`;
            }
            return 'Showing All System Timings';
        })();

        const filteredSystemLabel = (() => {
            if (
                filterSelectionMode === 'filter-by-system' &&
                filteredSystemCount !== undefined &&
                filteredSystemCount > 0
            ) {
                return `Showing Entity Timings For ${filteredSystemCount} ${filteredSystemCount === 1 ? 'System' : 'Systems'}`;
            }
            return 'Showing All Entity Timings';
        })();

        const lastResult: DebuggerRequestResultMessage | undefined = lastRequestedCommand
            ? getDebuggerRequestResult(lastRequestedCommand)
            : undefined;

        return (
            <div>
                <div style={{ flexDirection: 'column', display: 'flex', width: '100%' }}>
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
                            <DebuggerRequestResultBanner lastResult={lastResult} />
                        </div>
                    </div>
                </div>
                <div style={{ flexDirection: 'column', display: 'flex', width: '50%' }}>
                    <div style={{ flex: 1, margin: '5px' }}>
                        <h2>Selection Controls</h2>
                        <div className="dropdown-container">
                            <label htmlFor="ecs-filter-mode" style={{ marginBottom: '5px' }}>
                                Filter Mode <span style={{ opacity: 0.8 }}>🛈</span>
                            </label>
                            <VSCodeDropdown
                                id="ecs-filter-mode"
                                style={{ width: '100%' }}
                                value={filterSelectionMode}
                                onChange={(event: Event | React.FormEvent<HTMLElement>) => {
                                    const target = event.target as HTMLSelectElement;
                                    setFilterSelectionMode(target.value as FilterSelectionMode);
                                }}
                                title={
                                    'Select Filtering Mode:\n' +
                                    '\u2022 "No Filter" will display system and entity timings for all entities and systems.\n' +
                                    '\u2022 "Filter By Entity" allows you to select specific entities, and only show the system information for that selection.\n' +
                                    '\u2022 "Filter By Single Entity" allows you to select one specific entity, and only display information for that selection.\n' +
                                    '    This option has some performance benefits on the backend profiler versus multi select.\n' +
                                    '\u2022 "Filter By System" allows you to select specific systems and will only show the entities and entity timing values for those systems.'
                                }
                            >
                                <VSCodeOption value="no-filter">No Filter</VSCodeOption>
                                <VSCodeOption value="filter-by-entity">Filter By Entity</VSCodeOption>
                                <VSCodeOption value="filter-by-single-entity">Filter By Single Entity</VSCodeOption>
                                <VSCodeOption value="filter-by-system">Filter By System</VSCodeOption>
                            </VSCodeDropdown>
                        </div>
                        {filterSelectionMode === 'filter-by-single-entity' && (
                            <div className="dropdown-container" style={{ marginTop: '10px' }}>
                                <label htmlFor="ecs-single-entity-id" style={{ marginBottom: '5px' }}>
                                    Entity
                                </label>
                                <VSCodeDropdown
                                    id="ecs-single-entity-id"
                                    style={{ width: '100%' }}
                                    value={selectedSingleEntityId ?? ''}
                                    onChange={(event: Event | React.FormEvent<HTMLElement>) => {
                                        const target = event.target as HTMLSelectElement;
                                        const entityId = target.value || undefined;
                                        setSelectedSingleEntityId(entityId);
                                        if (entityId) {
                                            setLastRequestedCommand(FILTER_SINGLE_ENTITY_REQUEST);
                                            sendDebuggerRequest(FILTER_SINGLE_ENTITY_REQUEST, {
                                                entityIds: [entityId],
                                            });
                                        } else {
                                            // If we don't have a valid entity selected, still send the event with no id's
                                            setLastRequestedCommand(FILTER_SINGLE_ENTITY_REQUEST);
                                            sendDebuggerRequest(FILTER_SINGLE_ENTITY_REQUEST, {
                                                entityIds: [],
                                            });
                                        }
                                    }}
                                >
                                    <VSCodeOption value="">-- select an entity --</VSCodeOption>
                                    {availableEntities.map(({ id, fullName }) => (
                                        <VSCodeOption key={id} value={id}>
                                            {fullName}
                                        </VSCodeOption>
                                    ))}
                                </VSCodeDropdown>
                            </div>
                        )}
                    </div>
                </div>
                <div style={{ flexDirection: 'row', display: 'flex', width: '100%' }}>
                    <div style={{ flex: 1, marginRight: '5px' }}>
                        <div style={{ marginTop: '10px', marginBottom: '10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                <h2>Entity Timings</h2>
                                <div className="minecraft-entity-system-count-badge">
                                    <span className="minecraft-entity-system-count-badge-content">
                                        {filteredSystemLabel}
                                    </span>
                                </div>
                            </div>
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
                            ref={entityTimingsTableRef}
                            key={`entity-timings-${entityViewMode}-${selectedClient}`}
                            title="Entity Timings"
                            showTitle={false}
                            selectionEnabled={filterSelectionMode === 'filter-by-entity'}
                            selectionHeaderLabel="Filter To"
                            onSelectionChange={
                                filterSelectionMode === 'filter-by-entity' ? handleEntitySelectionChange : undefined
                            }
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
                                    statisticParentId: new RegExp(`${selectedClient}_client_ecs_entities`),
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
                            nonConsolidatedColumnResolver={event => resolveEcsColumn(event.id)}
                            sparklineColumnIndex={0}
                            sparklineTickRange={100}
                            sparklineValueFormatter={value => formatTimingValue(value, entityTimingUnit)}
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
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                <h2>System Timings</h2>
                                <div className="minecraft-entity-system-count-badge">
                                    <span className="minecraft-entity-system-count-badge-content">
                                        {filteredEntityLabel}
                                    </span>
                                </div>
                            </div>
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
                                <div className="dropdown-container">
                                    <label htmlFor="ecs-system-view-mode" style={{ marginBottom: '5px' }}>
                                        System View
                                    </label>
                                    <VSCodeDropdown
                                        id="ecs-system-view-mode"
                                        value={systemViewMode}
                                        onChange={(event: Event | React.FormEvent<HTMLElement>) => {
                                            const target = event.target as HTMLSelectElement;
                                            setSystemViewMode(target.value as SystemViewMode);
                                        }}
                                    >
                                        <VSCodeOption value="grouped">Grouped</VSCodeOption>
                                        <VSCodeOption value="flat">Flat</VSCodeOption>
                                    </VSCodeDropdown>
                                </div>
                            </div>
                        </div>
                        <MinecraftGroupedStatisticTable
                            key={`system-timings-${systemViewMode}-${selectedClient}`}
                            title="System Timings"
                            showTitle={false}
                            selectionEnabled={filterSelectionMode === 'filter-by-system'}
                            selectionHeaderLabel="Filter To"
                            onSelectionChange={
                                filterSelectionMode === 'filter-by-system' ? handleSystemSelectionChange : undefined
                            }
                            keyLabel="System"
                            valueLabels={[getTimingColumnLabel(systemTimingUnit), 'Percent Of Total']}
                            displayMode={
                                systemViewMode === 'grouped'
                                    ? MinecraftGroupedStatisticTableDisplayMode.Grouped
                                    : MinecraftGroupedStatisticTableDisplayMode.Flat
                            }
                            getGroupKey={(fullName: string) =>
                                resolveSystemCategoryGroupKey(fullName, systemCategoryLegendMap)
                            }
                            groupCountLabel="systems"
                            defaultCollapsed={true}
                            groupColumnAggregations={[
                                MinecraftGroupedStatisticTableColumnAggregation.Average,
                                MinecraftGroupedStatisticTableColumnAggregation.Sum,
                            ]}
                            statisticDataProvider={
                                new MultipleStatisticProvider({
                                    statisticIds: ['time_in_ns', 'percent_of_total'],
                                    statisticParentId: new RegExp(`${selectedClient}_client_ecs_systems`),
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
                            sparklineColumnIndex={0}
                            sparklineTickRange={100}
                            sparklineValueFormatter={value => formatTimingValue(value, systemTimingUnit)}
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

export default StatsTab;
