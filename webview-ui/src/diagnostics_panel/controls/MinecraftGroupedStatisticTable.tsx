// Copyright (C) Microsoft Corporation.  All rights reserved.

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { MultipleStatisticProvider, StatisticUpdatedMessage } from '../StatisticProvider';
import { StatisticResolver } from '../StatisticResolver';
import { VSCodeButton, VSCodeCheckbox, VSCodeDropdown, VSCodeOption } from '@vscode/webview-ui-toolkit/react';

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

type GroupedStatisticTableRow = {
    category: string;
    values: (string | number)[];
    time: number;
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
};

const sortOrderOptions = [
    { id: MinecraftGroupedStatisticTableSortOrder.Ascending, label: 'Ascending' },
    { id: MinecraftGroupedStatisticTableSortOrder.Descending, label: 'Descending' },
];

const sortTypeOptions = [
    { id: MinecraftGroupedStatisticTableSortType.Alphabetical, label: 'Alphabetical' },
    { id: MinecraftGroupedStatisticTableSortType.Numerical, label: 'Numerical' },
];

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
    });
}

export default function MinecraftGroupedStatisticTable({
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
}: MinecraftGroupedStatisticTableProps): JSX.Element {
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
    const isGroupedMode = displayMode === MinecraftGroupedStatisticTableDisplayMode.Grouped;
    const groupKeyResolver = getGroupKey ?? ((rowCategory: string) => rowCategory);

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

    const onToggleGroup = useCallback((groupKey: string): void => {
        setExpandedGroups(previousExpandedGroups => {
            const updated = new Set(previousExpandedGroups);

            if (updated.has(groupKey)) {
                updated.delete(groupKey);
            } else {
                updated.add(groupKey);
            }

            return updated;
        });
    }, []);

    const onTogglePinnedGroup = useCallback((groupKey: string): void => {
        setPinnedGroups(previousPinnedGroups => {
            const updated = new Set(previousPinnedGroups);

            if (updated.has(groupKey)) {
                updated.delete(groupKey);
            } else {
                updated.add(groupKey);
            }

            return updated;
        });
    }, []);

    const onTogglePinnedRow = useCallback((groupKey: string, rowCategory: string): void => {
        const rowPinKey = getRowPinKey(groupKey, rowCategory);

        setPinnedRows(previousPinnedRows => {
            const updated = new Set(previousPinnedRows);

            if (updated.has(rowPinKey)) {
                updated.delete(rowPinKey);
            } else {
                updated.add(rowPinKey);
            }

            return updated;
        });
    }, []);

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
                const isConsolidatedDataEvent =
                    event.id === 'consolidated_data' &&
                    event.children_string_values &&
                    event.children_string_values.length > 0;

                const categoryMap = new Map<string, GroupedStatisticTableRow>();

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
                        event.children_string_values,
                        categoryMap,
                        valueLabels,
                        prettifyNames,
                        event.time || Date.now(),
                    );
                } else {
                    const rawStats = statisticResolver(event, []);

                    rawStats.forEach(stat => {
                        if (!stat.category) {
                            return;
                        }

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

                    if (event.children_string_values && event.children_string_values.length > 0) {
                        processChildrenStringValues(
                            event.children_string_values,
                            categoryMap,
                            valueLabels,
                            prettifyNames,
                            event.time || Date.now(),
                        );
                    }
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
    }, [nonConsolidatedColumnResolver, prettifyNames, statisticDataProvider, statisticResolver, valueLabels]);

    useEffect(() => {
        const validGroupKeys = new Set<string>();
        const validRowKeys = new Set<string>();

        data.forEach(row => {
            const groupKey = groupKeyResolver(row.category);
            validGroupKeys.add(groupKey);
            validRowKeys.add(getRowPinKey(groupKey, row.category));
        });

        setPinnedGroups(previousPinnedGroups => {
            let changed = false;
            const updated = new Set<string>();

            previousPinnedGroups.forEach(groupKey => {
                if (validGroupKeys.has(groupKey)) {
                    updated.add(groupKey);
                    return;
                }

                changed = true;
            });

            return changed ? updated : previousPinnedGroups;
        });

        setPinnedRows(previousPinnedRows => {
            let changed = false;
            const updated = new Set<string>();

            previousPinnedRows.forEach(rowPinKey => {
                if (validRowKeys.has(rowPinKey)) {
                    updated.add(rowPinKey);
                    return;
                }

                changed = true;
            });

            return changed ? updated : previousPinnedRows;
        });
    }, [data, groupKeyResolver]);

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

        return (
            <tr
                key={rowKey}
                className={`minecraft-grouped-statistic-child-row${isPinned ? ' minecraft-grouped-statistic-row-pinned' : ''}`}
            >
                <td className="minecraft-grouped-statistic-table-grid-pin">
                    <VSCodeCheckbox
                        checked={isPinned}
                        onChange={() => onTogglePinnedRow(groupKey, row.category)}
                        aria-label={isPinned ? `Unpin ${row.category}` : `Pin ${row.category}`}
                    />
                </td>
                <td>
                    <span className="minecraft-grouped-statistic-child-key">{row.category}</span>
                </td>
                {row.values.map((value, valueIndex) => (
                    <td key={valueIndex} className="minecraft-grouped-statistic-table-grid-numeric">
                        {formatCellValue(value, valueIndex)}
                    </td>
                ))}
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
                            <th className="minecraft-grouped-statistic-table-grid-pin" aria-label="Pinned"></th>
                            <th>{keyLabel}</th>
                            {valueLabels.map(label => (
                                <th key={label} className="minecraft-grouped-statistic-table-grid-numeric">
                                    {label}
                                </th>
                            ))}
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
                                  const rows: JSX.Element[] = [
                                      <tr
                                          key={`group-${group.expansionKey}-${groupIndex}`}
                                          className={`minecraft-grouped-statistic-group-row${isGroupPinned ? ' minecraft-grouped-statistic-group-row-pinned' : ''}`}
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
                                          <td>
                                              <button
                                                  type="button"
                                                  className="minecraft-grouped-statistic-toggle"
                                                  onClick={() => onToggleGroup(group.expansionKey)}
                                                  aria-expanded={isExpanded}
                                                  aria-label={isExpanded ? 'Collapse group' : 'Expand group'}
                                              >
                                                  {isExpanded ? '▾' : '▸'}
                                              </button>
                                              <span className="minecraft-grouped-statistic-group-key">{group.key}</span>
                                              <span className="minecraft-grouped-statistic-group-meta">
                                                  ({group.count} {groupCountLabel}
                                                  {group.isSplit
                                                      ? group.isPinnedSection
                                                          ? ', pinned'
                                                          : ', unpinned'
                                                      : ''}
                                                  )
                                              </span>
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
}
