// Copyright (C) Microsoft Corporation.  All rights reserved.

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { MultipleStatisticProvider, StatisticUpdatedMessage } from '../StatisticProvider';
import { StatisticResolver } from '../StatisticResolver';
import { VSCodeButton, VSCodeDropdown, VSCodeOption } from '@vscode/webview-ui-toolkit/react';

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
    rows: GroupedStatisticTableRow[];
    count: number;
    sums: number[];
    averages: number[];
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
    groupCountLabel = 'entities',
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

                newestData.sort((left, right) => {
                    const compareValue = compareRows(
                        left,
                        right,
                        selectedSortType,
                        selectedSortColumn,
                        valueLabels.length,
                    );

                    return selectedSortOrder === MinecraftGroupedStatisticTableSortOrder.Ascending
                        ? compareValue
                        : -compareValue;
                });

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
        selectedSortColumn,
        selectedSortOrder,
        selectedSortType,
        statisticDataProvider,
        statisticResolver,
        valueLabels,
    ]);

    const groupedData = useMemo((): GroupedStatisticTableGroup[] => {
        if (!isGroupedMode) {
            return [];
        }

        const groups = new Map<string, GroupedStatisticTableGroup>();

        data.forEach(dataPoint => {
            const groupKey = groupKeyResolver(dataPoint.category);
            const existingGroup = groups.get(groupKey);

            if (!existingGroup) {
                groups.set(groupKey, {
                    key: groupKey,
                    rows: [dataPoint],
                    count: 1,
                    sums: Array(valueLabels.length).fill(0),
                    averages: Array(valueLabels.length).fill(0),
                });
                return;
            }

            existingGroup.rows.push(dataPoint);
            existingGroup.count += 1;
        });

        const groupedRows = Array.from(groups.values()).map(group => {
            const sums = Array(valueLabels.length).fill(0);

            group.rows.forEach(row => {
                for (let index = 0; index < valueLabels.length; index += 1) {
                    const numericValue = getNumericValue(row.values[index] ?? 0);
                    if (numericValue !== undefined) {
                        sums[index] += numericValue;
                    }
                }
            });

            const averages = sums.map(sum => (group.count === 0 ? 0 : sum / group.count));
            const sortedRows = [...group.rows].sort((left, right) => {
                const compareValue = compareRows(left, right, selectedSortType, selectedSortColumn, valueLabels.length);

                return selectedSortOrder === MinecraftGroupedStatisticTableSortOrder.Ascending
                    ? compareValue
                    : -compareValue;
            });

            return {
                ...group,
                rows: sortedRows,
                sums,
                averages,
            };
        });

        groupedRows.sort((left, right) => {
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

            return selectedSortOrder === MinecraftGroupedStatisticTableSortOrder.Ascending
                ? compareValue
                : -compareValue;
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
        valueLabels,
    ]);

    useEffect(() => {
        if (!isGroupedMode) {
            setExpandedGroups(new Set());
            return;
        }

        setExpandedGroups(previousExpandedGroups => {
            const updated = new Set<string>();

            groupedData.forEach(group => {
                if (previousExpandedGroups.has(group.key) || !defaultCollapsed) {
                    updated.add(group.key);
                }
            });

            return updated;
        });
    }, [defaultCollapsed, groupedData, isGroupedMode]);

    const renderLeafRow = (row: GroupedStatisticTableRow, rowKey: string): JSX.Element => (
        <tr key={rowKey} className="minecraft-grouped-statistic-child-row">
            <td>
                <span className="minecraft-grouped-statistic-child-key">{row.category}</span>
            </td>
            {row.values.map((value, valueIndex) => (
                <td key={valueIndex} className="minecraft-grouped-statistic-table-grid-numeric">
                    {valueFormatter
                        ? valueFormatter(value, valueIndex)
                        : typeof value === 'number'
                          ? value.toFixed(1)
                          : value}
                </td>
            ))}
            {rowAction && (
                <td
                    className="minecraft-grouped-statistic-table-grid-action"
                    style={{ width: rowAction.width || '120px' }}
                >
                    <VSCodeButton onClick={() => rowAction.onClick(row)} disabled={rowAction.disabled?.(row) ?? false}>
                        {rowAction.label}
                    </VSCodeButton>
                </td>
            )}
        </tr>
    );

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
                                  const isExpanded = expandedGroups.has(group.key);
                                  const rows: JSX.Element[] = [
                                      <tr
                                          key={`group-${group.key}-${groupIndex}`}
                                          className="minecraft-grouped-statistic-group-row"
                                      >
                                          <td>
                                              <button
                                                  type="button"
                                                  className="minecraft-grouped-statistic-toggle"
                                                  onClick={() => onToggleGroup(group.key)}
                                                  aria-expanded={isExpanded}
                                                  aria-label={isExpanded ? 'Collapse group' : 'Expand group'}
                                              >
                                                  {isExpanded ? '▾' : '▸'}
                                              </button>
                                              <span className="minecraft-grouped-statistic-group-key">{group.key}</span>
                                              <span className="minecraft-grouped-statistic-group-meta">
                                                  ({group.count} {groupCountLabel})
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
                                              `group-${group.key}-${groupIndex}-row-${row.category}-${rowIndex}`,
                                          ),
                                      ),
                                  ];
                              })
                            : data.map((row, rowIndex) => renderLeafRow(row, `flat-row-${row.category}-${rowIndex}`))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
