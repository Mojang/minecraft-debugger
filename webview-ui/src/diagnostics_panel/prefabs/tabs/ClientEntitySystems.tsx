// Copyright (C) Microsoft Corporation.  All rights reserved.

import { ParentNameStatResolver, StatisticType, YAxisType, createStatResolver } from '../../StatisticResolver';
import { TabPrefab, TabPrefabDataSource, TabPrefabParams } from '../TabPrefab';
import MinecraftGroupedStatisticTable, {
    MinecraftGroupedStatisticTableExportRow,
    MinecraftGroupedStatisticTableColumnAggregation,
    MinecraftGroupedStatisticTableDisplayMode,
    MinecraftGroupedStatisticTableHandle,
    MinecraftGroupedStatisticTableSelectionSnapshot,
    MinecraftGroupedStatisticTableSortOrder,
    MinecraftGroupedStatisticTableSortType,
    SPARKLINE_SAMPLE_INTERVAL_SECONDS,
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
import { CsvCellValue, TableCsvExporter } from '../../exporters/TableCsvExporter';
import { sendExportDataRequest } from '../../utilities/exportData';

type DiagnosticsExportTableType = 'entity' | 'system';

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
type TrendDurationOption = { label: string; points: number };

const UNCATEGORIZED_SYSTEM_GROUP = 'INVALID CATEGORY';
const DEFAULT_TREND_DURATION_POINTS = 100;
const TREND_DURATION_OPTIONS: ReadonlyArray<TrendDurationOption> = [
    { label: '15 seconds', points: 25 },
    { label: '30 seconds', points: 50 },
    { label: '1 minute', points: 100 },
    { label: '2 minutes', points: 200 },
    { label: '5 minutes', points: 500 },
    { label: '10 minutes', points: 1000 },
];

const EXPORT_CSV_HEADERS = [
    'TimingUnit',
    'GroupKey',
    'Category',
    'SampleIndex',
    'ElapsedSeconds',
    'TrendValue',
] as const;

type ExportCsvHeader = (typeof EXPORT_CSV_HEADERS)[number];
type ExportCsvRow = Record<ExportCsvHeader, CsvCellValue>;

function convertTimingValueFromNs(value: number, unit: TimingUnit): number {
    if (!Number.isFinite(value)) {
        return 0;
    }

    if (unit === 'ms') {
        return Number((value / 1_000_000).toFixed(3));
    }

    if (unit === 'us') {
        return Number((value / 1_000).toFixed(1));
    }

    return value;
}

function buildExportRows(
    tableRows: MinecraftGroupedStatisticTableExportRow[],
    timingUnit: TimingUnit,
    sampleIntervalSeconds: number,
): ExportCsvRow[] {
    const rows: ExportCsvRow[] = [];

    tableRows.forEach(tableRow => {
        if (tableRow.trendValues.length === 0) {
            rows.push({
                TimingUnit: timingUnit,
                GroupKey: tableRow.groupKey,
                Category: tableRow.row.category,
                SampleIndex: '',
                ElapsedSeconds: '',
                TrendValue: '',
            });
            return;
        }

        tableRow.trendValues.forEach((trendValue, sampleIndex) => {
            rows.push({
                TimingUnit: timingUnit,
                GroupKey: tableRow.groupKey,
                Category: tableRow.row.category,
                SampleIndex: sampleIndex,
                ElapsedSeconds: Number((sampleIndex * sampleIntervalSeconds).toFixed(3)),
                TrendValue: convertTimingValueFromNs(trendValue, timingUnit),
            });
        });
    });

    return rows;
}

function formatExportTimestamp(now: Date): string {
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const day = String(now.getUTCDate()).padStart(2, '0');
    const hours = String(now.getUTCHours()).padStart(2, '0');
    const minutes = String(now.getUTCMinutes()).padStart(2, '0');
    const seconds = String(now.getUTCSeconds()).padStart(2, '0');

    return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

function buildExportFileName(tableType: DiagnosticsExportTableType, now: Date): string {
    return `${tableType}-trends-${formatExportTimestamp(now)}.csv`;
}

function getFilterSelectionModeTooltip(ecsVersion: number): string {
    if (ecsVersion === 2) {
        return (
            'Select Filtering Mode:\n' +
            '\u2022 "No Filter" will display system and entity timings for all entities and systems.\n' +
            '\u2022 "Filter By Entity" allows you to select specific entities, and only show the system information for that selection.\n' +
            '\u2022 "Filter By Single Entity" allows you to select one specific entity, and only display information for that selection.\n' +
            '    This option has some performance benefits on the backend profiler versus multi select.\n' +
            '\u2022 "Filter By System" allows you to select specific systems and will only show the entities and entity timing values for those systems.'
        );
    } else if (ecsVersion === 1) {
        return (
            'Select Filtering Mode:\n' +
            '\u2022 "No Filter" will display system and entity timings for all entities and systems.\n' +
            '\u2022 "Filter By Entity" allows you to select specific entities, and only show the system information for that selection.\n' +
            '\u2022 "Filter By Single Entity" allows you to select one specific entity, and only display information for that selection.\n' +
            '    This option has some performance benefits on the backend profiler versus multi select.'
        );
    } else {
        console.error('Received unknown ECS version from client, defaulting to showing all filter options in tooltip');
        return (
            'Select Filtering Mode:\n' +
            '\u2022 "No Filter" will display system and entity timings for all entities and systems.\n' +
            '\u2022 "Filter By Entity" allows you to select specific entities, and only show the system information for that selection.\n' +
            '\u2022 "Filter By Single Entity" allows you to select one specific entity, and only display information for that selection.\n' +
            '    This option has some performance benefits on the backend profiler versus multi select.\n' +
            '\u2022 "Filter By System" allows you to select specific systems and will only show the entities and entity timing values for those systems.'
        );
    }
}

function ceilToDecimalPlace(value: number, decimalPlaces: number): string {
    return (Math.ceil(value * Math.pow(10, decimalPlaces)) / Math.pow(10, decimalPlaces)).toFixed(decimalPlaces);
}

function getTimingColumnLabel(unit: TimingUnit): string {
    if (unit === 'ms') {
        return 'Time (ms)';
    }

    if (unit === 'us') {
        return 'Time (µs)';
    }

    return 'Time (ns)';
}

function formatTimingValue(value: number, unit: TimingUnit): string {
    if (!Number.isFinite(value)) {
        return `0 ${unit}`;
    }

    if (unit === 'ms') {
        return `${ceilToDecimalPlace(value / 1_000_000, 3)} ms`;
    }

    if (unit === 'us') {
        return `${ceilToDecimalPlace(value / 1_000, 1)} µs`;
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

function formatStatKey(key: string): string {
    return key.split('(')[0].trim();
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
        const [ecsVersion, setECSVersion] = useState<number>(1);
        const [isStarted, setIsStarted] = useState<boolean>(false);
        const [trendDurationPoints, setTrendDurationPoints] = useState<number>(DEFAULT_TREND_DURATION_POINTS);
        const entityTimingsTableRef = useRef<MinecraftGroupedStatisticTableHandle | null>(null);
        const systemTimingsTableRef = useRef<MinecraftGroupedStatisticTableHandle | null>(null);
        const isMountRef = useRef(true);
        const csvExporter = useMemo(() => new TableCsvExporter(), []);
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

        const entityValueLabels = [getTimingColumnLabel(entityTimingUnit), '% Of Total'];
        const systemValueLabels = [getTimingColumnLabel(systemTimingUnit), '% Of Total'];
        const selectedTrendDurationLabel =
            TREND_DURATION_OPTIONS.find(option => option.points === trendDurationPoints)?.label ?? 'Custom';

        const clearProfilerData = useCallback((): void => {
            entityTimingsTableRef.current?.clearSelection();
            entityTimingsTableRef.current?.clearTrendData();
            systemTimingsTableRef.current?.clearSelection();
            systemTimingsTableRef.current?.clearTrendData();

            setSelectedSingleEntityId(undefined);
            setFilteredEntityCount(undefined);
            setFilteredSystemCount(undefined);
        }, []);

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

        useEffect(() => {
            if (lastRequestedCommand !== START_ENTITY_SYSTEM_PROFILER_REQUEST) {
                return;
            }

            if (lastResult?.response?.args) {
                setECSVersion(lastResult.response.args as number);
                console.log(`Received ECS version ${ecsVersion} from client`);
            }

            setIsStarted(lastResult?.response?.success ?? false);
            console.log(`Entity System Profiler is started: ${isStarted}`);
        }, [lastResult, lastRequestedCommand]);

        const exportTableData = useCallback(
            (tableType: DiagnosticsExportTableType): void => {
                const tableHandle =
                    tableType === 'entity' ? entityTimingsTableRef.current : systemTimingsTableRef.current;
                if (!tableHandle) {
                    console.warn(`No table handle available for ${tableType} export.`);
                    return;
                }

                const tableRows = tableHandle.getRowsForExport();
                const timingUnit = tableType === 'entity' ? entityTimingUnit : systemTimingUnit;
                const exportRows = buildExportRows(tableRows, timingUnit, SPARKLINE_SAMPLE_INTERVAL_SECONDS);

                const now = new Date();
                const csvContent = csvExporter.exportRows(EXPORT_CSV_HEADERS, exportRows);

                sendExportDataRequest({
                    format: csvExporter.format,
                    mimeType: csvExporter.mimeType,
                    suggestedFileName: buildExportFileName(tableType, now),
                    content: csvContent,
                });
            },
            [csvExporter, entityTimingUnit, systemTimingUnit],
        );

        return (
            <div>
                <div style={{ flexDirection: 'column', display: 'flex', width: '100%' }}>
                    <div style={{ flex: 1, margin: '5px' }}>
                        <div style={{ marginTop: '20px' }}>
                            <DebuggerRequestResultBanner lastResult={lastResult} />
                        </div>
                        <h2>Entity System Profiler Controls</h2>
                        {DEBUGGER_REQUEST_COMMANDS.map(command => {
                            const inFlight = isDebuggerRequestInFlight(command.command);
                            return (
                                <VSCodeButton
                                    key={command.command}
                                    disabled={inFlight}
                                    onClick={() => {
                                        setLastRequestedCommand(command.command);

                                        if (command.command === 'Clear Entity System Profiler') {
                                            clearProfilerData();
                                        }

                                        sendDebuggerRequest(command.command);
                                    }}
                                    style={{ margin: '5px' }}
                                >
                                    {command.label}
                                </VSCodeButton>
                            );
                        })}
                        {isStarted && (
                            <div className="minecraft-entity-system-general-controls">
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
                                        title={getFilterSelectionModeTooltip(ecsVersion)}
                                    >
                                        <VSCodeOption value="no-filter">No Filter</VSCodeOption>
                                        <VSCodeOption value="filter-by-entity">Filter By Entity</VSCodeOption>
                                        <VSCodeOption value="filter-by-single-entity">
                                            Filter By Single Entity
                                        </VSCodeOption>
                                        {ecsVersion >= 2 && (
                                            <VSCodeOption value="filter-by-system">Filter By System</VSCodeOption>
                                        )}
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
                                <div className="dropdown-container" style={{ marginTop: '10px' }}>
                                    <label htmlFor="ecs-trend-duration" style={{ marginBottom: '5px' }}>
                                        Trend Duration
                                    </label>
                                    <VSCodeDropdown
                                        id="ecs-trend-duration"
                                        style={{ width: '100%' }}
                                        value={`${trendDurationPoints}`}
                                        onChange={(event: Event | React.FormEvent<HTMLElement>) => {
                                            const target = event.target as HTMLSelectElement;
                                            const selectedPoints = Number.parseInt(target.value, 10);

                                            if (!Number.isFinite(selectedPoints)) {
                                                return;
                                            }

                                            setTrendDurationPoints(selectedPoints);
                                        }}
                                    >
                                        {TREND_DURATION_OPTIONS.map(option => (
                                            <VSCodeOption key={option.points} value={`${option.points}`}>
                                                {option.label}
                                            </VSCodeOption>
                                        ))}
                                    </VSCodeDropdown>
                                    <span style={{ opacity: 0.75, fontSize: '12px', marginTop: '4px' }}>
                                        Showing latest {selectedTrendDurationLabel} in chart and export data.
                                    </span>
                                </div>

                                <div className="minecraft-entity-system-export-actions">
                                    <VSCodeButton onClick={() => exportTableData('entity')} disabled={!isStarted}>
                                        Export Entity CSV
                                    </VSCodeButton>
                                    <VSCodeButton onClick={() => exportTableData('system')} disabled={!isStarted}>
                                        Export System CSV
                                    </VSCodeButton>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                {isStarted && (
                    <div>
                        <div className="minecraft-entity-systems-tables-container">
                            <div className="minecraft-entity-systems-table-wrapper">
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
                                        filterSelectionMode === 'filter-by-entity'
                                            ? handleEntitySelectionChange
                                            : undefined
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
                                    sparklineTickRange={trendDurationPoints}
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
                            <div className="minecraft-entity-systems-table-wrapper">
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
                                    ref={systemTimingsTableRef}
                                    key={`system-timings-${systemViewMode}-${selectedClient}`}
                                    title="System Timings"
                                    showTitle={false}
                                    selectionEnabled={filterSelectionMode === 'filter-by-system'}
                                    selectionHeaderLabel="Filter To"
                                    onSelectionChange={
                                        filterSelectionMode === 'filter-by-system'
                                            ? handleSystemSelectionChange
                                            : undefined
                                    }
                                    keyLabel="System"
                                    valueLabels={systemValueLabels}
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
                                    sparklineTickRange={trendDurationPoints}
                                    sparklineValueFormatter={value => formatTimingValue(value, systemTimingUnit)}
                                    keyFormatter={formatStatKey}
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
                )}
            </div>
        );
    },
};

export default StatsTab;
