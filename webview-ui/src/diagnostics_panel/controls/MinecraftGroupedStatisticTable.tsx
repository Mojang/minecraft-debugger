// Copyright (C) Microsoft Corporation.  All rights reserved.

import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { MultipleStatisticProvider, StatisticUpdatedMessage } from '../StatisticProvider';
import { StatisticResolver } from '../StatisticResolver';
import { VSCodeButton, VSCodeCheckbox, VSCodeDropdown, VSCodeOption } from '@vscode/webview-ui-toolkit/react';
import { SparklineCell } from './SparklineCell';

export enum MinecraftGroupedStatisticTableSortOrder {
    Ascending,
    Descending,
}

export enum MinecraftGroupedStatisticTableSortType {
    Alphabetical,
    Numerical,
}

export enum MinecraftGroupedStatisticTableSortColumn {
    Key = 'key',
}

export enum MinecraftGroupedStatisticTableDisplayMode {
    Grouped = 'grouped',
    Flat = 'flat',
}

export enum MinecraftGroupedStatisticTableColumnAggregation {
    Average = 'average',
    Sum = 'sum',
}

export type GroupedStatisticTableRow = {
    category: string;
    values: (string | number)[];
    time: number;
};

type SparklineNormalizationBounds = {
    min: number;
    max: number;
};

type GroupedStatisticTableGroup = {
    key: string;
    expansionKey: string;
    rows: GroupedStatisticTableRow[];
    count: number;
    sums: number[];
    averages: number[];
    isPinnedSection: boolean;
    isSplit: boolean;
};

type GroupedStatisticTableRowAction = {
    label: string;
    onClick: (row: GroupedStatisticTableRow) => void;
    disabled?: (row: GroupedStatisticTableRow) => boolean;
    headerLabel?: string;
    width?: string;
};

type NonConsolidatedColumnResolver = (event: StatisticUpdatedMessage, valueLabels: string[]) => number | undefined;

export type MinecraftGroupedStatisticTableSelectionSnapshot = {
    selectedGroupKeys: string[];
    selectedRowKeys: string[];
    resolvedSelectedRows: GroupedStatisticTableRow[];
};

export type MinecraftGroupedStatisticTableHandle = {
    getSelectionSnapshot: () => MinecraftGroupedStatisticTableSelectionSnapshot;
    clearSelection: () => void;
};

type MinecraftGroupedStatisticTableProps = {
    title: string;
    showTitle?: boolean;
    statisticDataProvider: MultipleStatisticProvider;
    statisticResolver: StatisticResolver;
    keyLabel: string;
    valueLabels: string[];
    getGroupKey?: (rowCategory: string) => string;
    displayMode?: MinecraftGroupedStatisticTableDisplayMode;
    groupColumnAggregations?: MinecraftGroupedStatisticTableColumnAggregation[];
    groupCountLabel?: string;
    defaultCollapsed?: boolean;
    defaultSortOrder?: MinecraftGroupedStatisticTableSortOrder;
    defaultSortType?: MinecraftGroupedStatisticTableSortType;
    defaultSortColumn?: string;
    rowAction?: GroupedStatisticTableRowAction;
    nonConsolidatedColumnResolver?: NonConsolidatedColumnResolver;
    valueFormatter?: (value: string | number, columnIndex: number) => string;
    prettifyNames?: boolean;
    selectionEnabled?: boolean;
    selectionHeaderLabel?: string;
    defaultSelectAllGroups?: boolean;
    onSelectionChange?: (snapshot: MinecraftGroupedStatisticTableSelectionSnapshot) => void;
    sparklineColumnIndex?: number;
    sparklineTickRange?: number;
    sparklineValueFormatter?: (value: number) => string;
};

const sortOrderOptions = [
    { id: MinecraftGroupedStatisticTableSortOrder.Ascending, label: 'Ascending' },
    { id: MinecraftGroupedStatisticTableSortOrder.Descending, label: 'Descending' },
];

const sortTypeOptions = [
    { id: MinecraftGroupedStatisticTableSortType.Alphabetical, label: 'Alphabetical' },
    { id: MinecraftGroupedStatisticTableSortType.Numerical, label: 'Numerical' },
];

const NON_CONSOLIDATED_STALE_TICK_THRESHOLD = 3;
const SPARKLINE_BOUNDS_EXPAND_LERP = 0.35;
const SPARKLINE_BOUNDS_CONTRACT_LERP = 0.12;
const SPARKLINE_HISTORY_RETENTION_TICKS = 8;

function getRowSparklineSeriesKey(category: string): string {
    return `row:${category}`;
}

function getGroupSparklineSeriesKey(expansionKey: string): string {
    return `group:${expansionKey}`;
}

function lerpValue(current: number, target: number, alpha: number): number {
    return current + (target - current) * alpha;
}

function getSparklineBounds(values: number[]): SparklineNormalizationBounds {
    const min = values.length > 0 ? Math.min(...values) : 0;
    let max = values.length > 0 ? Math.max(...values) : 0;

    // Gaurd against max being the same as min
    // to avoid issues normalizing the lines.
    if (max <= min) {
        max = min + 0.01;
    }

    return { min, max };
}

function smoothSparklineBounds(
    previousBounds: SparklineNormalizationBounds,
    targetBounds: SparklineNormalizationBounds,
): SparklineNormalizationBounds {
    // Lerp the normalization bounds toward the target to prevent
    // sharp changes in normalization.
    // Use a more aggressive lerp when expanding bounds than when contracting them to help ensure that
    // new values are visibile in a reasonable timeframe.
    const minLerp =
        targetBounds.min < previousBounds.min ? SPARKLINE_BOUNDS_EXPAND_LERP : SPARKLINE_BOUNDS_CONTRACT_LERP;
    const maxLerp =
        targetBounds.max > previousBounds.max ? SPARKLINE_BOUNDS_EXPAND_LERP : SPARKLINE_BOUNDS_CONTRACT_LERP;

    const min = lerpValue(previousBounds.min, targetBounds.min, minLerp);
    let max = lerpValue(previousBounds.max, targetBounds.max, maxLerp);

    // Again, guard against max being the same as min after lerping to avoid normalization issues.
    if (max <= min) {
        max = min + 0.01;
    }

    return { min, max };
}

function aggregateGroupHistory(
    rows: GroupedStatisticTableRow[],
    historyMap: Map<string, number[]>,
    tickRange: number,
): number[] {
    const histories = rows.map(row => historyMap.get(row.category) ?? []).filter(history => history.length > 0);
    if (histories.length === 0) {
        return [];
    }

    // Max length is the minimum of the tick range and the longest history
    // to prevent aggregating more values than we have ticks to display
    const maxLength = Math.min(tickRange, Math.max(...histories.map(history => history.length)));
    if (maxLength === 0) {
        return [];
    }

    const result = Array(maxLength).fill(0);

    for (const history of histories) {
        const historyStartIndex = maxLength - history.length;

        for (let i = 0; i < maxLength; i++) {
            // If the history doesn't have a value for this index,
            // use the oldest value in the history to extend it backwards.
            if (i < historyStartIndex) {
                result[i] += history[0];
                continue;
            }

            result[i] += history[i - historyStartIndex];
        }
    }

    return result;
}

function getColumnIndexFromSortColumn(sortColumn: string, valueLabelsLength: number): number | undefined {
    const columnIndex = parseInt(sortColumn.replace('value_', ''));
    if (isNaN(columnIndex) || columnIndex < 0 || columnIndex >= valueLabelsLength) {
        return undefined;
    }

    return columnIndex;
}

function getNumericValue(value: string | number): number | undefined {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : undefined;
    }

    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : undefined;
}

function getGroupColumnAggregation(
    columnIndex: number,
    groupColumnAggregations: MinecraftGroupedStatisticTableColumnAggregation[],
): MinecraftGroupedStatisticTableColumnAggregation {
    return groupColumnAggregations[columnIndex] ?? MinecraftGroupedStatisticTableColumnAggregation.Average;
}

function getAggregatedGroupColumnValue(
    group: GroupedStatisticTableGroup,
    columnIndex: number,
    groupColumnAggregations: MinecraftGroupedStatisticTableColumnAggregation[],
): number {
    const aggregation = getGroupColumnAggregation(columnIndex, groupColumnAggregations);

    if (aggregation === MinecraftGroupedStatisticTableColumnAggregation.Sum) {
        return group.sums[columnIndex] ?? 0;
    }

    return group.averages[columnIndex] ?? 0;
}

function compareRows(
    a: GroupedStatisticTableRow,
    b: GroupedStatisticTableRow,
    selectedSortType: MinecraftGroupedStatisticTableSortType,
    selectedSortColumn: string,
    valueLabelsLength: number,
): number {
    if (selectedSortColumn === MinecraftGroupedStatisticTableSortColumn.Key) {
        return a.category.localeCompare(b.category);
    }

    const columnIndex = getColumnIndexFromSortColumn(selectedSortColumn, valueLabelsLength);
    if (columnIndex === undefined) {
        return a.category.localeCompare(b.category);
    }

    const aValue = a.values[columnIndex] ?? '';
    const bValue = b.values[columnIndex] ?? '';

    if (selectedSortType === MinecraftGroupedStatisticTableSortType.Alphabetical) {
        return String(aValue).localeCompare(String(bValue));
    }

    const aNumericValue = getNumericValue(aValue);
    const bNumericValue = getNumericValue(bValue);

    if (aNumericValue === undefined && bNumericValue === undefined) {
        return String(aValue).localeCompare(String(bValue));
    }

    if (aNumericValue === undefined) {
        return 1;
    }

    if (bNumericValue === undefined) {
        return -1;
    }

    return aNumericValue - bNumericValue;
}

function applySortOrder(compareValue: number, selectedSortOrder: MinecraftGroupedStatisticTableSortOrder): number {
    return selectedSortOrder === MinecraftGroupedStatisticTableSortOrder.Ascending ? compareValue : -compareValue;
}

function getRowPinKey(groupKey: string, rowCategory: string): string {
    return `${groupKey}_${rowCategory}`;
}

function getGroupExpansionKey(groupKey: string, isPinnedSection: boolean, isSplit: boolean): string {
    if (!isSplit) {
        // if we aren't split we can just use the group key
        return groupKey;
    }

    // if we are split we need to differentiate between the pinned and unpinned sections for expansion state
    return `${groupKey}_${isPinnedSection ? 'pinned' : 'unpinned'}`;
}

function buildGroupedStatisticTableGroup(
    key: string,
    rows: GroupedStatisticTableRow[],
    valueLabelsLength: number,
    isPinnedSection: boolean,
    isSplit: boolean,
): GroupedStatisticTableGroup {
    const sums = Array(valueLabelsLength).fill(0);

    rows.forEach(row => {
        for (let index = 0; index < valueLabelsLength; index += 1) {
            const numericValue = getNumericValue(row.values[index] ?? 0);
            if (numericValue !== undefined) {
                sums[index] += numericValue;
            }
        }
    });

    const count = rows.length;

    return {
        key,
        expansionKey: getGroupExpansionKey(key, isPinnedSection, isSplit),
        rows,
        count,
        sums,
        averages: sums.map(sum => (count === 0 ? 0 : sum / count)),
        isPinnedSection,
        isSplit,
    };
}

function processChildrenStringValues(
    childrenStringValues: string[][],
    categoryMap: Map<string, GroupedStatisticTableRow>,
    valueLabels: string[],
    prettifyNames: boolean,
    eventTime: number,
    observedCategories?: Set<string>,
): void {
    childrenStringValues.forEach(childRow => {
        // The first childRow value is the rowName,
        // followed by values,
        // only process rows that have at least a value
        if (childRow.length < 2) {
            return;
        }

        const rowName = childRow[0];
        const values: (string | number)[] = [];

        for (let i = 1; i < childRow.length; i += 1) {
            const rawValue = childRow[i];
            const numericValue = parseFloat(rawValue);
            values.push(isNaN(numericValue) ? rawValue : numericValue);
        }

        while (values.length < valueLabels.length) {
            values.push('');
        }

        const cleanRowName = prettifyNames
            ? rowName
                  .split('::')
                  .pop()
                  ?.replace(/([a-z])([A-Z])/g, '$1 $2')
                  ?.replace(/^./, (character: string) => character.toUpperCase()) || rowName
            : rowName.split('::').pop() || rowName;

        categoryMap.set(cleanRowName, {
            category: cleanRowName,
            values,
            time: eventTime,
        });
        observedCategories?.add(cleanRowName);
    });
}

const MinecraftGroupedStatisticTable = forwardRef<
    MinecraftGroupedStatisticTableHandle,
    MinecraftGroupedStatisticTableProps
>(function MinecraftGroupedStatisticTable(
    {
        title,
        showTitle = true,
        statisticDataProvider,
        statisticResolver,
        keyLabel,
        valueLabels,
        getGroupKey,
        displayMode = MinecraftGroupedStatisticTableDisplayMode.Grouped,
        groupColumnAggregations = [],
        groupCountLabel = '',
        defaultCollapsed = true,
        defaultSortOrder = MinecraftGroupedStatisticTableSortOrder.Descending,
        defaultSortType = MinecraftGroupedStatisticTableSortType.Numerical,
        defaultSortColumn,
        rowAction,
        nonConsolidatedColumnResolver,
        valueFormatter,
        prettifyNames = false,
        selectionEnabled = false,
        selectionHeaderLabel = 'Selected',
        defaultSelectAllGroups = false,
        onSelectionChange,
        sparklineColumnIndex = 0,
        sparklineTickRange = 0,
        sparklineValueFormatter,
    }: MinecraftGroupedStatisticTableProps,
    ref,
): JSX.Element {
    const sortColumnOptions = useMemo(
        () => [
            { id: MinecraftGroupedStatisticTableSortColumn.Key, label: keyLabel },
            ...valueLabels.map((label, index) => ({ id: `value_${index}`, label })),
        ],
        [keyLabel, valueLabels],
    );

    const [data, setData] = useState<GroupedStatisticTableRow[]>([]);
    const [selectedSortOrder, setSelectedSortOrder] =
        useState<MinecraftGroupedStatisticTableSortOrder>(defaultSortOrder);
    const [selectedSortType, setSelectedSortType] = useState<MinecraftGroupedStatisticTableSortType>(defaultSortType);
    const [selectedSortColumn, setSelectedSortColumn] = useState<string>(
        defaultSortColumn || MinecraftGroupedStatisticTableSortColumn.Key,
    );
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
    const [pinnedGroups, setPinnedGroups] = useState<Set<string>>(new Set());
    const [pinnedRows, setPinnedRows] = useState<Set<string>>(new Set());
    const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
    const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
    const [deselectedRowsInSelectedGroups, setDeselectedRowsInSelectedGroups] = useState<Set<string>>(new Set());
    const [hasInitializedDefaultSelection, setHasInitializedDefaultSelection] = useState<boolean>(false);
    const nonConsolidatedTickCounterRef = useRef(0);
    const nonConsolidatedLastEventTimeRef = useRef<number | undefined>(undefined);
    const nonConsolidatedLastSeenTickByCategoryRef = useRef<Map<string, number>>(new Map());
    const rowHistoryRef = useRef<Map<string, number[]>>(new Map());
    const rowHistoryMissingTickCountRef = useRef<Map<string, number>>(new Map());
    const sparklineBoundsRef = useRef<Map<string, SparklineNormalizationBounds>>(new Map());
    const isGroupedMode = displayMode === MinecraftGroupedStatisticTableDisplayMode.Grouped;
    const groupKeyResolver = getGroupKey ?? ((rowCategory: string) => rowCategory);

    const getSmoothedSparklineBounds = useCallback(
        (seriesKey: string, history: number[]): SparklineNormalizationBounds => {
            const targetBounds = getSparklineBounds(history);

            const previousBounds = sparklineBoundsRef.current.get(seriesKey);
            if (!previousBounds) {
                sparklineBoundsRef.current.set(seriesKey, targetBounds);
                return targetBounds;
            }

            const smoothedBounds = smoothSparklineBounds(previousBounds, targetBounds);
            sparklineBoundsRef.current.set(seriesKey, smoothedBounds);
            return smoothedBounds;
        },
        [],
    );

    const groupedRowsByKey = useMemo((): Map<string, GroupedStatisticTableRow[]> => {
        const groupedRows = new Map<string, GroupedStatisticTableRow[]>();

        data.forEach(row => {
            const groupKey = groupKeyResolver(row.category);
            const existing = groupedRows.get(groupKey);

            if (existing) {
                existing.push(row);
                return;
            }

            groupedRows.set(groupKey, [row]);
        });

        return groupedRows;
    }, [data, groupKeyResolver]);

    const rowKeysByGroup = useMemo((): Map<string, string[]> => {
        const rowKeys = new Map<string, string[]>();

        groupedRowsByKey.forEach((rows, groupKey) => {
            rowKeys.set(
                groupKey,
                rows.map(row => getRowPinKey(groupKey, row.category)),
            );
        });

        return rowKeys;
    }, [groupedRowsByKey]);

    const rowLookup = useMemo((): Map<string, GroupedStatisticTableRow> => {
        const lookup = new Map<string, GroupedStatisticTableRow>();

        groupedRowsByKey.forEach((rows, groupKey) => {
            rows.forEach(row => {
                lookup.set(getRowPinKey(groupKey, row.category), row);
            });
        });

        return lookup;
    }, [groupedRowsByKey]);

    const rowGroupLookup = useMemo((): Map<string, string> => {
        const lookup = new Map<string, string>();

        groupedRowsByKey.forEach((rows, groupKey) => {
            rows.forEach(row => {
                lookup.set(getRowPinKey(groupKey, row.category), groupKey);
            });
        });

        return lookup;
    }, [groupedRowsByKey]);

    const isRowSelected = useCallback(
        (groupKey: string, rowPinKey: string): boolean => {
            if (selectedGroups.has(groupKey)) {
                return !deselectedRowsInSelectedGroups.has(rowPinKey);
            }

            return selectedRows.has(rowPinKey);
        },
        [deselectedRowsInSelectedGroups, selectedGroups, selectedRows],
    );

    const controlIdBase = useId().replace(/:/g, '');

    const onSelectedSortOrderChange = useCallback((event: Event | React.FormEvent<HTMLElement>): void => {
        const target = event.target as HTMLSelectElement;
        setSelectedSortOrder(Number(target.value));
    }, []);

    const onSelectedSortTypeChange = useCallback((event: Event | React.FormEvent<HTMLElement>): void => {
        const target = event.target as HTMLSelectElement;
        setSelectedSortType(Number(target.value));
    }, []);

    const onSelectedSortColumnChange = useCallback((event: Event | React.FormEvent<HTMLElement>): void => {
        const target = event.target as HTMLSelectElement;
        setSelectedSortColumn(target.value);
    }, []);

    // Helper function to toggle values in a Set, returning a new Set instance
    // If the set already contains the key, it will be removed.
    // If it does not contain the key, it will be added.
    const handleSetToggle = useCallback((set: Set<string>, key: string): Set<string> => {
        const updated = new Set(set);
        if (updated.has(key)) {
            updated.delete(key);
        } else {
            updated.add(key);
        }
        return updated;
    }, []);

    const onToggleGroup = useCallback((groupKey: string): void => {
        setExpandedGroups(previousExpandedGroups => {
            return handleSetToggle(previousExpandedGroups, groupKey);
        });
    }, []);

    const onTogglePinnedGroup = useCallback((groupKey: string): void => {
        setPinnedGroups(previousPinnedGroups => {
            return handleSetToggle(previousPinnedGroups, groupKey);
        });
    }, []);

    const onTogglePinnedRow = useCallback((groupKey: string, rowCategory: string): void => {
        const rowPinKey = getRowPinKey(groupKey, rowCategory);

        setPinnedRows(previousPinnedRows => {
            return handleSetToggle(previousPinnedRows, rowPinKey);
        });
    }, []);

    const onToggleSelectedGroup = useCallback(
        (groupKey: string): void => {
            const groupRowKeys = rowKeysByGroup.get(groupKey) || [];
            const selectedGroupRowCount = groupRowKeys.filter(rowKey => isRowSelected(groupKey, rowKey)).length;
            const isGroupFullySelected = groupRowKeys.length > 0 && selectedGroupRowCount === groupRowKeys.length;

            setSelectedGroups(previousSelectedGroups => {
                const updated = new Set(previousSelectedGroups);

                if (isGroupFullySelected) {
                    updated.delete(groupKey);
                } else {
                    updated.add(groupKey);
                }

                return updated;
            });

            setSelectedRows(previousSelectedRows => {
                const updated = new Set(previousSelectedRows);

                groupRowKeys.forEach(rowKey => {
                    updated.delete(rowKey);
                });

                return updated;
            });

            setDeselectedRowsInSelectedGroups(previousDeselectedRows => {
                const updated = new Set(previousDeselectedRows);

                groupRowKeys.forEach(rowKey => {
                    updated.delete(rowKey);
                });

                return updated;
            });
        },
        [isRowSelected, rowKeysByGroup],
    );

    const onToggleSelectedRow = useCallback(
        (groupKey: string, rowCategory: string): void => {
            const rowPinKey = getRowPinKey(groupKey, rowCategory);
            const isGroupSelected = selectedGroups.has(groupKey);

            if (isGroupSelected) {
                setDeselectedRowsInSelectedGroups(previousDeselectedRows => {
                    const updated = new Set(previousDeselectedRows);

                    if (updated.has(rowPinKey)) {
                        updated.delete(rowPinKey);
                    } else {
                        updated.add(rowPinKey);
                    }

                    return updated;
                });

                setSelectedRows(previousSelectedRows => {
                    if (!previousSelectedRows.has(rowPinKey)) {
                        return previousSelectedRows;
                    }

                    const updated = new Set(previousSelectedRows);
                    updated.delete(rowPinKey);
                    return updated;
                });

                return;
            }

            setSelectedRows(previousSelectedRows => {
                const updated = new Set(previousSelectedRows);

                if (updated.has(rowPinKey)) {
                    updated.delete(rowPinKey);
                } else {
                    updated.add(rowPinKey);
                }

                return updated;
            });

            setDeselectedRowsInSelectedGroups(previousDeselectedRows => {
                if (!previousDeselectedRows.has(rowPinKey)) {
                    return previousDeselectedRows;
                }

                const updated = new Set(previousDeselectedRows);
                updated.delete(rowPinKey);
                return updated;
            });
        },
        [selectedGroups],
    );

    const selectionSnapshot = useMemo((): MinecraftGroupedStatisticTableSelectionSnapshot => {
        const resolvedRowsByKey = new Map<string, GroupedStatisticTableRow>();

        selectedGroups.forEach(groupKey => {
            (groupedRowsByKey.get(groupKey) || []).forEach(row => {
                const rowKey = getRowPinKey(groupKey, row.category);

                if (deselectedRowsInSelectedGroups.has(rowKey)) {
                    return;
                }

                resolvedRowsByKey.set(rowKey, row);
            });
        });

        selectedRows.forEach(rowKey => {
            const rowGroupKey = rowGroupLookup.get(rowKey);
            if (rowGroupKey && selectedGroups.has(rowGroupKey) && deselectedRowsInSelectedGroups.has(rowKey)) {
                return;
            }

            const row = rowLookup.get(rowKey);
            if (row) {
                resolvedRowsByKey.set(rowKey, row);
            }
        });

        const resolvedSelectedRows = Array.from(resolvedRowsByKey.entries())
            .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
            .map(([, row]) => row);

        return {
            selectedGroupKeys: Array.from(selectedGroups).sort((left, right) => left.localeCompare(right)),
            selectedRowKeys: Array.from(resolvedRowsByKey.keys()).sort((left, right) => left.localeCompare(right)),
            resolvedSelectedRows,
        };
    }, [deselectedRowsInSelectedGroups, groupedRowsByKey, rowGroupLookup, rowLookup, selectedGroups, selectedRows]);

    useImperativeHandle(
        ref,
        () => ({
            getSelectionSnapshot: () => selectionSnapshot,
            clearSelection: () => {
                setSelectedGroups(new Set());
                setSelectedRows(new Set());
                setDeselectedRowsInSelectedGroups(new Set());
            },
        }),
        [selectionSnapshot],
    );

    const prevSelectionRowKeysRef = useRef<string[]>([]);
    useEffect(() => {
        if (!onSelectionChange) {
            return;
        }

        const prev = prevSelectionRowKeysRef.current;
        const curr = selectionSnapshot.selectedRowKeys;
        const changed = prev.length !== curr.length || curr.some((key, index) => key !== prev[index]);

        if (!changed) {
            return;
        }

        prevSelectionRowKeysRef.current = curr;
        onSelectionChange(selectionSnapshot);
    }, [onSelectionChange, selectionSnapshot]);

    useEffect(() => {
        setSelectedSortOrder(defaultSortOrder);
    }, [defaultSortOrder]);

    useEffect(() => {
        setSelectedSortType(defaultSortType);
    }, [defaultSortType]);

    useEffect(() => {
        setSelectedSortColumn(defaultSortColumn || MinecraftGroupedStatisticTableSortColumn.Key);
    }, [defaultSortColumn]);

    useEffect(() => {
        const eventHandler = (event: StatisticUpdatedMessage): void => {
            setData(previousState => {
                const isConsolidatedDataEvent = event.id === 'consolidated_data';

                const categoryMap = new Map<string, GroupedStatisticTableRow>();
                const observedCategories = new Set<string>();

                if (!isConsolidatedDataEvent) {
                    previousState.forEach(previousRow => {
                        categoryMap.set(previousRow.category, {
                            category: previousRow.category,
                            values: [...previousRow.values],
                            time: previousRow.time,
                        });
                    });
                }

                const valueColumnIndex = isConsolidatedDataEvent
                    ? undefined
                    : nonConsolidatedColumnResolver?.(event, valueLabels);

                if (!isConsolidatedDataEvent && valueColumnIndex === undefined) {
                    if (import.meta.env.DEV) {
                        console.warn(
                            `Skipping non-consolidated event with unmapped column id=${event.id} name=${event.name}`,
                        );
                    }

                    return Array.from(categoryMap.values());
                }

                if (isConsolidatedDataEvent) {
                    processChildrenStringValues(
                        event.children_string_values ?? [],
                        categoryMap,
                        valueLabels,
                        prettifyNames,
                        event.time || Date.now(),
                        observedCategories,
                    );

                    categoryMap.forEach((row, category) => {
                        const value = row.values[sparklineColumnIndex];
                        if (typeof value === 'number') {
                            const history = rowHistoryRef.current.get(category) ?? [];
                            history.push(value);
                            if (history.length > sparklineTickRange) {
                                history.splice(0, history.length - sparklineTickRange);
                            }
                            rowHistoryRef.current.set(category, history);
                        }
                    });

                    nonConsolidatedTickCounterRef.current = 0;
                    nonConsolidatedLastEventTimeRef.current = undefined;
                    nonConsolidatedLastSeenTickByCategoryRef.current.clear();
                } else {
                    const eventTime = Number.isFinite(event.time) ? event.time : undefined;
                    const lastEventTime = nonConsolidatedLastEventTimeRef.current;

                    if (eventTime === undefined) {
                        nonConsolidatedTickCounterRef.current += 1;
                    } else if (lastEventTime === undefined || lastEventTime !== eventTime) {
                        nonConsolidatedTickCounterRef.current += 1;
                        nonConsolidatedLastEventTimeRef.current = eventTime;
                    }

                    const currentTickCounter = Math.max(1, nonConsolidatedTickCounterRef.current);

                    const rawStats = statisticResolver(event, []);

                    rawStats.forEach(stat => {
                        if (!stat.category) {
                            return;
                        }

                        observedCategories.add(stat.category);

                        const existing = categoryMap.get(stat.category);
                        if (existing) {
                            while (existing.values.length < valueLabels.length) {
                                existing.values.push(0);
                            }

                            const targetColumn = valueColumnIndex as number;
                            existing.values[targetColumn] = stat.absoluteValue;
                            existing.time = Math.max(existing.time, stat.time);
                        } else {
                            const created: GroupedStatisticTableRow = {
                                category: stat.category,
                                values: Array(valueLabels.length).fill(0),
                                time: stat.time,
                            };

                            const targetColumn = valueColumnIndex as number;
                            created.values[targetColumn] = stat.absoluteValue;
                            categoryMap.set(stat.category, created);
                        }
                    });

                    if (sparklineColumnIndex !== undefined && valueColumnIndex === sparklineColumnIndex) {
                        rawStats.forEach(stat => {
                            if (!stat.category) {
                                return;
                            }
                            const history = rowHistoryRef.current.get(stat.category) ?? [];
                            history.push(stat.absoluteValue);
                            if (history.length > sparklineTickRange) {
                                history.splice(0, history.length - sparklineTickRange);
                            }
                            rowHistoryRef.current.set(stat.category, history);
                        });
                    }

                    if (event.children_string_values && event.children_string_values.length > 0) {
                        processChildrenStringValues(
                            event.children_string_values,
                            categoryMap,
                            valueLabels,
                            prettifyNames,
                            event.time || Date.now(),
                            observedCategories,
                        );
                    }

                    const lastSeenByCategory = nonConsolidatedLastSeenTickByCategoryRef.current;

                    observedCategories.forEach(category => {
                        lastSeenByCategory.set(category, currentTickCounter);
                    });

                    categoryMap.forEach((_, rowCategory) => {
                        if (observedCategories.has(rowCategory)) {
                            return;
                        }

                        const lastSeenEvent = lastSeenByCategory.get(rowCategory);
                        if (lastSeenEvent === undefined) {
                            // Bootstrap rows that predate tick-based tracking without immediate removal.
                            lastSeenByCategory.set(rowCategory, currentTickCounter);
                            return;
                        }

                        if (currentTickCounter - lastSeenEvent >= NON_CONSOLIDATED_STALE_TICK_THRESHOLD) {
                            categoryMap.delete(rowCategory);
                            lastSeenByCategory.delete(rowCategory);
                        }
                    });
                }

                const newestData = Array.from(categoryMap.values());
                return newestData;
            });
        };

        statisticDataProvider.registerWindowListener(window);
        statisticDataProvider.addSubscriber(eventHandler);

        return () => {
            statisticDataProvider.removeSubscriber(eventHandler);
            statisticDataProvider.unregisterWindowListener(window);
        };
    }, [
        nonConsolidatedColumnResolver,
        prettifyNames,
        sparklineColumnIndex,
        sparklineTickRange,
        statisticDataProvider,
        statisticResolver,
        valueLabels,
    ]);

    useEffect(() => {
        const validGroupKeys = new Set<string>();
        const validRowKeys = new Set<string>();

        data.forEach(row => {
            const groupKey = groupKeyResolver(row.category);
            validGroupKeys.add(groupKey);
            validRowKeys.add(getRowPinKey(groupKey, row.category));
        });

        const handleUpdateSet = (set: Set<string>, validKeys: Set<string>): Set<string> => {
            let changed = false;
            const updated = new Set<string>();

            set.forEach(key => {
                if (validKeys.has(key)) {
                    updated.add(key);
                    return;
                }

                changed = true;
            });

            return changed ? updated : set;
        };

        setPinnedGroups(previousPinnedGroups => {
            return handleUpdateSet(previousPinnedGroups, validGroupKeys);
        });

        setPinnedRows(previousPinnedRows => {
            return handleUpdateSet(previousPinnedRows, validRowKeys);
        });

        setSelectedGroups(previousSelectedGroups => {
            return handleUpdateSet(previousSelectedGroups, validGroupKeys);
        });

        setSelectedRows(previousSelectedRows => {
            return handleUpdateSet(previousSelectedRows, validRowKeys);
        });

        setDeselectedRowsInSelectedGroups(previousDeselectedRows => {
            return handleUpdateSet(previousDeselectedRows, validRowKeys);
        });

        const validCategories = new Set(data.map(row => row.category));
        validCategories.forEach(category => {
            rowHistoryMissingTickCountRef.current.delete(category);
        });

        rowHistoryRef.current.forEach((_, category) => {
            if (validCategories.has(category)) {
                return;
            }

            const missedTickCount = (rowHistoryMissingTickCountRef.current.get(category) ?? 0) + 1;
            if (missedTickCount < SPARKLINE_HISTORY_RETENTION_TICKS) {
                rowHistoryMissingTickCountRef.current.set(category, missedTickCount);
                return;
            }

            rowHistoryRef.current.delete(category);
            rowHistoryMissingTickCountRef.current.delete(category);
            sparklineBoundsRef.current.delete(getRowSparklineSeriesKey(category));
        });

        sparklineBoundsRef.current.forEach((_, seriesKey) => {
            if (!seriesKey.startsWith('row:')) {
                return;
            }

            if (!validCategories.has(seriesKey) && !rowHistoryRef.current.has(seriesKey)) {
                sparklineBoundsRef.current.delete(seriesKey);
            }
        });
    }, [data, groupKeyResolver]);

    useEffect(() => {
        if (sparklineColumnIndex !== undefined) {
            return;
        }

        rowHistoryRef.current.clear();
        rowHistoryMissingTickCountRef.current.clear();
        sparklineBoundsRef.current.clear();
    }, [sparklineColumnIndex]);

    useEffect(() => {
        if (!selectionEnabled || !defaultSelectAllGroups || hasInitializedDefaultSelection) {
            return;
        }

        if (rowKeysByGroup.size === 0) {
            return;
        }

        setSelectedGroups(new Set(rowKeysByGroup.keys()));
        setSelectedRows(new Set());
        setDeselectedRowsInSelectedGroups(new Set());
        setHasInitializedDefaultSelection(true);
    }, [defaultSelectAllGroups, hasInitializedDefaultSelection, rowKeysByGroup, selectionEnabled]);

    const groupedData = useMemo((): GroupedStatisticTableGroup[] => {
        if (!isGroupedMode) {
            return [];
        }

        const groups = new Map<string, GroupedStatisticTableRow[]>();

        data.forEach(dataPoint => {
            const groupKey = groupKeyResolver(dataPoint.category);
            const existingGroup = groups.get(groupKey);

            if (!existingGroup) {
                groups.set(groupKey, [dataPoint]);
                return;
            }

            existingGroup.push(dataPoint);
        });

        const groupedRows: GroupedStatisticTableGroup[] = [];

        groups.forEach((groupRows, groupKey) => {
            const sortedRows = [...groupRows].sort((left, right) => {
                const compareValue = compareRows(left, right, selectedSortType, selectedSortColumn, valueLabels.length);
                const orderedCompareValue = applySortOrder(compareValue, selectedSortOrder);

                return orderedCompareValue === 0 ? left.category.localeCompare(right.category) : orderedCompareValue;
            });

            if (pinnedGroups.has(groupKey)) {
                groupedRows.push(
                    buildGroupedStatisticTableGroup(groupKey, sortedRows, valueLabels.length, false, false),
                );
                return;
            }

            const pinnedSegmentRows = sortedRows.filter(row => pinnedRows.has(getRowPinKey(groupKey, row.category)));
            const unpinnedSegmentRows = sortedRows.filter(row => !pinnedRows.has(getRowPinKey(groupKey, row.category)));
            // If we've got a mix of pinned and unpinned rows we need to split them into separate groups
            // so that the pinned rows can be together in a "pinned" version of the group
            // while the unpinned rows can stay together in the "unpinned" version, respecting
            // the regular unpinned sorting order
            const isSplit = pinnedSegmentRows.length > 0 && unpinnedSegmentRows.length > 0;

            if (pinnedSegmentRows.length > 0) {
                groupedRows.push(
                    buildGroupedStatisticTableGroup(groupKey, pinnedSegmentRows, valueLabels.length, true, isSplit),
                );
            }

            if (unpinnedSegmentRows.length > 0) {
                groupedRows.push(
                    buildGroupedStatisticTableGroup(groupKey, unpinnedSegmentRows, valueLabels.length, false, isSplit),
                );
            }
        });

        groupedRows.sort((left, right) => {
            const leftPinned = pinnedGroups.has(left.key) || left.isPinnedSection;
            const rightPinned = pinnedGroups.has(right.key) || right.isPinnedSection;

            if (leftPinned !== rightPinned) {
                return leftPinned ? -1 : 1;
            }

            let compareValue = left.key.localeCompare(right.key);

            if (selectedSortColumn !== MinecraftGroupedStatisticTableSortColumn.Key) {
                const columnIndex = getColumnIndexFromSortColumn(selectedSortColumn, valueLabels.length);
                if (columnIndex !== undefined) {
                    const leftAggregatedValue = getAggregatedGroupColumnValue(
                        left,
                        columnIndex,
                        groupColumnAggregations,
                    );
                    const rightAggregatedValue = getAggregatedGroupColumnValue(
                        right,
                        columnIndex,
                        groupColumnAggregations,
                    );

                    if (selectedSortType === MinecraftGroupedStatisticTableSortType.Numerical) {
                        compareValue = leftAggregatedValue - rightAggregatedValue;
                    } else {
                        compareValue = String(leftAggregatedValue).localeCompare(String(rightAggregatedValue));
                    }
                }
            }

            const orderedCompareValue = applySortOrder(compareValue, selectedSortOrder);

            if (orderedCompareValue !== 0) {
                return orderedCompareValue;
            }

            if (left.isPinnedSection !== right.isPinnedSection) {
                return left.isPinnedSection ? -1 : 1;
            }

            return left.key.localeCompare(right.key);
        });

        return groupedRows;
    }, [
        data,
        groupColumnAggregations,
        groupKeyResolver,
        isGroupedMode,
        selectedSortColumn,
        selectedSortOrder,
        selectedSortType,
        pinnedGroups,
        pinnedRows,
        valueLabels,
    ]);

    useEffect(() => {
        const validGroupSeriesKeys = new Set(groupedData.map(group => getGroupSparklineSeriesKey(group.expansionKey)));

        sparklineBoundsRef.current.forEach((_, seriesKey) => {
            if (!seriesKey.startsWith('group:')) {
                return;
            }

            if (!validGroupSeriesKeys.has(seriesKey)) {
                sparklineBoundsRef.current.delete(seriesKey);
            }
        });
    }, [groupedData]);

    const sortedFlatData = useMemo((): GroupedStatisticTableRow[] => {
        if (isGroupedMode) {
            return [];
        }

        const rows = [...data];

        rows.sort((left, right) => {
            const leftGroupKey = groupKeyResolver(left.category);
            const rightGroupKey = groupKeyResolver(right.category);
            const leftPinned = pinnedRows.has(getRowPinKey(leftGroupKey, left.category));
            const rightPinned = pinnedRows.has(getRowPinKey(rightGroupKey, right.category));

            if (leftPinned !== rightPinned) {
                return leftPinned ? -1 : 1;
            }

            const compareValue = compareRows(left, right, selectedSortType, selectedSortColumn, valueLabels.length);
            const orderedCompareValue = applySortOrder(compareValue, selectedSortOrder);

            return orderedCompareValue === 0 ? left.category.localeCompare(right.category) : orderedCompareValue;
        });

        return rows;
    }, [
        data,
        groupKeyResolver,
        isGroupedMode,
        pinnedRows,
        selectedSortColumn,
        selectedSortOrder,
        selectedSortType,
        valueLabels.length,
    ]);

    const formatCellValue = useCallback(
        (value: string | number, valueIndex: number): string | number => {
            if (valueFormatter) {
                return valueFormatter(value, valueIndex);
            }

            if (typeof value === 'number') {
                return value.toFixed(1);
            }

            return value;
        },
        [valueFormatter],
    );

    useEffect(() => {
        if (!isGroupedMode) {
            setExpandedGroups(new Set());
            return;
        }

        setExpandedGroups(previousExpandedGroups => {
            const updated = new Set<string>();

            groupedData.forEach(group => {
                const wasExpanded =
                    previousExpandedGroups.has(group.expansionKey) ||
                    (group.isSplit && previousExpandedGroups.has(group.key)) ||
                    (!group.isSplit &&
                        (previousExpandedGroups.has(getGroupExpansionKey(group.key, true, true)) ||
                            previousExpandedGroups.has(getGroupExpansionKey(group.key, false, true))));

                if (wasExpanded || !defaultCollapsed) {
                    updated.add(group.expansionKey);
                }
            });

            return updated;
        });
    }, [defaultCollapsed, groupedData, isGroupedMode]);

    const renderLeafRow = (row: GroupedStatisticTableRow, rowKey: string, groupKey: string): JSX.Element => {
        const rowPinKey = getRowPinKey(groupKey, row.category);
        const isPinned = pinnedRows.has(rowPinKey);
        const isSelected = isRowSelected(groupKey, rowPinKey);
        const sparklineHistory = rowHistoryRef.current.get(row.category) ?? [];
        const sparklineBounds = getSmoothedSparklineBounds(getRowSparklineSeriesKey(row.category), sparklineHistory);

        return (
            <tr
                key={rowKey}
                className={`minecraft-grouped-statistic-child-row${isPinned ? ' minecraft-grouped-statistic-row-pinned' : ''}${isSelected ? ' minecraft-grouped-statistic-row-selected' : ''}`}
            >
                <td className="minecraft-grouped-statistic-table-grid-pin">
                    <VSCodeCheckbox
                        checked={isPinned}
                        onChange={() => onTogglePinnedRow(groupKey, row.category)}
                        aria-label={isPinned ? `Unpin ${row.category}` : `Pin ${row.category}`}
                    />
                </td>
                {selectionEnabled && (
                    <td className="minecraft-grouped-statistic-table-grid-select">
                        <VSCodeCheckbox
                            checked={isSelected}
                            onClick={() => onToggleSelectedRow(groupKey, row.category)}
                            aria-label={isSelected ? `Deselect ${row.category}` : `Select ${row.category}`}
                        />
                    </td>
                )}
                <td>
                    <span className="minecraft-grouped-statistic-child-key">{row.category}</span>
                </td>
                {row.values.map((value, valueIndex) => (
                    <td key={valueIndex} className="minecraft-grouped-statistic-table-grid-numeric">
                        {formatCellValue(value, valueIndex)}
                    </td>
                ))}
                {sparklineColumnIndex !== undefined && (
                    <td className="minecraft-grouped-statistic-table-grid-sparkline">
                        <SparklineCell
                            values={sparklineHistory}
                            formatValue={sparklineValueFormatter}
                            displayedMin={sparklineBounds.min}
                            displayedMax={sparklineBounds.max}
                        />
                    </td>
                )}
                {rowAction && (
                    <td
                        className="minecraft-grouped-statistic-table-grid-action"
                        style={{ width: rowAction.width || '120px' }}
                    >
                        <VSCodeButton
                            onClick={() => rowAction.onClick(row)}
                            disabled={rowAction.disabled?.(row) ?? false}
                        >
                            {rowAction.label}
                        </VSCodeButton>
                    </td>
                )}
            </tr>
        );
    };

    return (
        <div className="minecraft-grouped-statistic-table-root">
            {showTitle && <h2>{title}</h2>}
            <div className="minecraft-grouped-statistic-toolbar">
                <div className="minecraft-grouped-statistic-toolbar-group">
                    <label htmlFor={`${controlIdBase}-sort-order`}>Sort Order</label>
                    <VSCodeDropdown
                        id={`${controlIdBase}-sort-order`}
                        onChange={onSelectedSortOrderChange}
                        value={`${selectedSortOrder}`}
                    >
                        {sortOrderOptions.map(option => (
                            <VSCodeOption key={option.id} value={`${option.id}`}>
                                {option.label}
                            </VSCodeOption>
                        ))}
                    </VSCodeDropdown>
                </div>
                <div className="minecraft-grouped-statistic-toolbar-group">
                    <label htmlFor={`${controlIdBase}-sort-type`}>Sort Type</label>
                    <VSCodeDropdown
                        id={`${controlIdBase}-sort-type`}
                        onChange={onSelectedSortTypeChange}
                        value={`${selectedSortType}`}
                    >
                        {sortTypeOptions.map(option => (
                            <VSCodeOption key={option.id} value={`${option.id}`}>
                                {option.label}
                            </VSCodeOption>
                        ))}
                    </VSCodeDropdown>
                </div>
                <div className="minecraft-grouped-statistic-toolbar-group">
                    <label htmlFor={`${controlIdBase}-sort-column`}>Sort Column</label>
                    <VSCodeDropdown
                        id={`${controlIdBase}-sort-column`}
                        onChange={onSelectedSortColumnChange}
                        value={selectedSortColumn}
                    >
                        {sortColumnOptions.map(option => (
                            <VSCodeOption key={option.id} value={option.id}>
                                {option.label}
                            </VSCodeOption>
                        ))}
                    </VSCodeDropdown>
                </div>
            </div>

            <div className="minecraft-grouped-statistic-table-surface">
                <table className="minecraft-grouped-statistic-table-grid">
                    <thead>
                        <tr>
                            <th className="minecraft-grouped-statistic-table-grid-pin">Pin</th>
                            {selectionEnabled && (
                                <th className="minecraft-grouped-statistic-table-grid-select">
                                    {selectionHeaderLabel}
                                </th>
                            )}
                            <th>{keyLabel}</th>
                            {valueLabels.map(label => (
                                <th key={label} className="minecraft-grouped-statistic-table-grid-numeric">
                                    {label}
                                </th>
                            ))}
                            {sparklineColumnIndex !== undefined && (
                                <th className="minecraft-grouped-statistic-table-grid-sparkline">Trend</th>
                            )}
                            {rowAction && (
                                <th className="minecraft-grouped-statistic-table-grid-action">
                                    {rowAction.headerLabel || 'Action'}
                                </th>
                            )}
                        </tr>
                    </thead>
                    <tbody>
                        {isGroupedMode
                            ? groupedData.flatMap((group, groupIndex) => {
                                  const isExpanded = expandedGroups.has(group.expansionKey);
                                  const isGroupExplicitlyPinned = pinnedGroups.has(group.key);
                                  const isGroupPinned = isGroupExplicitlyPinned || group.isPinnedSection;
                                  const groupRows = groupedRowsByKey.get(group.key) || [];
                                  const selectedGroupRowCount = groupRows.filter(row =>
                                      isRowSelected(group.key, getRowPinKey(group.key, row.category)),
                                  ).length;
                                  const isGroupSelected =
                                      groupRows.length > 0 && selectedGroupRowCount === groupRows.length;
                                  const isGroupSelectionIndeterminate =
                                      selectedGroupRowCount > 0 && selectedGroupRowCount < groupRows.length;
                                  const rows: JSX.Element[] = [
                                      <tr
                                          key={`group-${group.expansionKey}-${groupIndex}`}
                                          className={`minecraft-grouped-statistic-group-row${isGroupPinned ? ' minecraft-grouped-statistic-group-row-pinned' : ''}${isGroupSelected ? ' minecraft-grouped-statistic-row-selected' : ''}`}
                                      >
                                          <td className="minecraft-grouped-statistic-table-grid-pin">
                                              <VSCodeCheckbox
                                                  checked={isGroupExplicitlyPinned}
                                                  onChange={() => onTogglePinnedGroup(group.key)}
                                                  aria-label={
                                                      isGroupExplicitlyPinned
                                                          ? `Unpin group ${group.key}`
                                                          : `Pin group ${group.key}`
                                                  }
                                                  title={
                                                      group.isPinnedSection && !isGroupExplicitlyPinned
                                                          ? 'Pinned section contains pinned child items'
                                                          : undefined
                                                  }
                                              />
                                          </td>
                                          {selectionEnabled && (
                                              <td className="minecraft-grouped-statistic-table-grid-select">
                                                  <VSCodeCheckbox
                                                      checked={isGroupSelected}
                                                      indeterminate={isGroupSelectionIndeterminate}
                                                      onClick={() => onToggleSelectedGroup(group.key)}
                                                      aria-label={
                                                          isGroupSelected
                                                              ? `Deselect group ${group.key}`
                                                              : `Select group ${group.key}`
                                                      }
                                                  />
                                              </td>
                                          )}
                                          <td>
                                              <div className="minecraft-grouped-statistic-group-label">
                                                  <div className="minecraft-grouped-statistic-group-title">
                                                      <button
                                                          type="button"
                                                          className="minecraft-grouped-statistic-toggle"
                                                          onClick={() => onToggleGroup(group.expansionKey)}
                                                          aria-expanded={isExpanded}
                                                          aria-label={isExpanded ? 'Collapse group' : 'Expand group'}
                                                      >
                                                          {isExpanded ? '▾' : '▸'}
                                                      </button>
                                                      <span className="minecraft-grouped-statistic-group-key">
                                                          {group.key}
                                                      </span>
                                                  </div>
                                                  <span className="minecraft-grouped-statistic-group-meta">
                                                      ({group.count} {groupCountLabel}
                                                      {group.isSplit
                                                          ? group.isPinnedSection
                                                              ? ', pinned'
                                                              : ', unpinned'
                                                          : ''}
                                                      )
                                                  </span>
                                              </div>
                                          </td>
                                          {valueLabels.map((label, valueIndex) => {
                                              const aggregatedValue = getAggregatedGroupColumnValue(
                                                  group,
                                                  valueIndex,
                                                  groupColumnAggregations,
                                              );
                                              const aggregation = getGroupColumnAggregation(
                                                  valueIndex,
                                                  groupColumnAggregations,
                                              );
                                              const formattedValue = valueFormatter
                                                  ? valueFormatter(aggregatedValue, valueIndex)
                                                  : aggregatedValue.toFixed(1);
                                              const displayValue =
                                                  aggregation ===
                                                  MinecraftGroupedStatisticTableColumnAggregation.Average
                                                      ? `${formattedValue} (avg)`
                                                      : formattedValue;

                                              return (
                                                  <td
                                                      key={`${group.key}-${label}`}
                                                      className="minecraft-grouped-statistic-table-grid-numeric"
                                                  >
                                                      {displayValue}
                                                  </td>
                                              );
                                          })}
                                          {sparklineColumnIndex !== undefined &&
                                              (() => {
                                                  const groupSparklineHistory = aggregateGroupHistory(
                                                      group.rows,
                                                      rowHistoryRef.current,
                                                      sparklineTickRange,
                                                  );
                                                  const groupSparklineBounds = getSmoothedSparklineBounds(
                                                      getGroupSparklineSeriesKey(group.expansionKey),
                                                      groupSparklineHistory,
                                                  );

                                                  return (
                                                      <td className="minecraft-grouped-statistic-table-grid-sparkline">
                                                          <SparklineCell
                                                              values={groupSparklineHistory}
                                                              formatValue={sparklineValueFormatter}
                                                              displayedMin={groupSparklineBounds.min}
                                                              displayedMax={groupSparklineBounds.max}
                                                          />
                                                      </td>
                                                  );
                                              })()}
                                          {rowAction && (
                                              <td className="minecraft-grouped-statistic-table-grid-action" />
                                          )}
                                      </tr>,
                                  ];

                                  if (!isExpanded) {
                                      return rows;
                                  }

                                  return [
                                      ...rows,
                                      ...group.rows.map((row, rowIndex) =>
                                          renderLeafRow(
                                              row,
                                              `group-${group.expansionKey}-${groupIndex}-row-${row.category}-${rowIndex}`,
                                              group.key,
                                          ),
                                      ),
                                  ];
                              })
                            : sortedFlatData.map((row, rowIndex) =>
                                  renderLeafRow(
                                      row,
                                      `flat-row-${row.category}-${rowIndex}`,
                                      groupKeyResolver(row.category),
                                  ),
                              )}
                    </tbody>
                </table>
            </div>
        </div>
    );
});

export default MinecraftGroupedStatisticTable;
