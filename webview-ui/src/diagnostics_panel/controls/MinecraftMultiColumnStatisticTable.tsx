// Copyright (C) Microsoft Corporation.  All rights reserved.

import { useCallback, useEffect, useState, useMemo } from 'react';
import { MultipleStatisticProvider, StatisticUpdatedMessage } from '../StatisticProvider';
import { StatisticResolver } from '../StatisticResolver';
import {
    VSCodeDataGrid,
    VSCodeDataGridRow,
    VSCodeDataGridCell,
    VSCodeDropdown,
    VSCodeOption,
    VSCodeButton,
} from '@vscode/webview-ui-toolkit/react';

export enum MinecraftMultiColumnStatisticTableSortOrder {
    Ascending,
    Descending,
}

export enum MinecraftMultiColumnStatisticTableSortType {
    Alphabetical,
    Numerical,
}

export enum MinecraftMultiColumnStatisticTableSortColumn {
    Key = 'key',
    // Value columns will be added dynamically based on valueLabels
}

type MultiColumnTrackedStat = {
    category: string;
    values: (string | number)[];
    time: number;
};

type MinecraftMultiColumnStatisticTableRowAction = {
    label: string;
    onClick: (row: MultiColumnTrackedStat) => void;
    disabled?: (row: MultiColumnTrackedStat) => boolean;
    headerLabel?: string;
    width?: string;
};

type NonConsolidatedColumnResolver = (event: StatisticUpdatedMessage, valueLabels: string[]) => number | undefined;

type MinecraftMultiColumnStatisticTableProps = {
    title: string;
    statisticDataProvider: MultipleStatisticProvider;
    statisticResolver: StatisticResolver;
    defaultSortOrder?: MinecraftMultiColumnStatisticTableSortOrder;
    defaultSortType?: MinecraftMultiColumnStatisticTableSortType;
    defaultSortColumn?: string;

    keyLabel: string;
    valueLabels: string[]; // Array of labels for value columns
    prettifyNames?: boolean; // Whether to format packet names (camelCase -> Camel Case) or keep original format
    columnWidths?: string[]; // Optional array of column widths (first is key column, rest are value columns)
    actions?: { label: string; onClick: () => void }[]; // Optional actions with labels and commands to run on click
    rowAction?: MinecraftMultiColumnStatisticTableRowAction; // Optional per-row action button
    nonConsolidatedColumnResolver?: NonConsolidatedColumnResolver; // Maps split events to target columns for non-consolidated streams
    valueFormatter?: (value: string | number, columnIndex: number) => string; // Optional custom display formatter for cell values
};

const sortOrderOptions = [
    { id: MinecraftMultiColumnStatisticTableSortOrder.Ascending, label: 'Ascending' },
    { id: MinecraftMultiColumnStatisticTableSortOrder.Descending, label: 'Descending' },
];

const sortTypeOptions = [
    { id: MinecraftMultiColumnStatisticTableSortType.Alphabetical, label: 'Alphabetical' },
    { id: MinecraftMultiColumnStatisticTableSortType.Numerical, label: 'Numerical' },
];

// Helper function to process children_string_values and populate categoryMap
function processChildrenStringValues(
    children_string_values: string[][],
    categoryMap: Map<string, MultiColumnTrackedStat>,
    valueLabels: string[],
    prettifyNames: boolean,
    eventTime: number,
    targetColumnIndex?: number,
): void {
    children_string_values.forEach(childRow => {
        if (childRow.length >= 2) {
            // Format: [packet_name, value1, value2, value3, value4, value5, ...]
            const packetName = childRow[0];

            // Parse values from the row, preserving original types
            const values: (string | number)[] = [];
            for (let i = 1; i < childRow.length; i++) {
                const rawValue = childRow[i];
                // Try to parse as number, but keep as string if it's not numeric
                const numValue = parseFloat(rawValue);
                values.push(isNaN(numValue) ? rawValue : numValue);
            }

            // Ensure we have at least as many values as valueLabels expects
            while (values.length < valueLabels.length) {
                values.push('');
            }

            // Process packet name based on prettifyNames setting
            const cleanPacketName = prettifyNames
                ? packetName
                      .split('::')
                      .pop()
                      ?.replace(/([a-z])([A-Z])/g, '$1 $2') // Add spaces before capital letters
                      ?.replace(/^./, (str: string) => str.toUpperCase()) || packetName // Capitalize first letter
                : packetName.split('::').pop() || packetName;

            if (targetColumnIndex !== undefined && values.length === 1 && valueLabels.length > 1) {
                const existingValues = categoryMap.get(cleanPacketName)?.values ?? Array(valueLabels.length).fill('');
                const mergedValues = [...existingValues];
                mergedValues[targetColumnIndex] = values[0];

                categoryMap.set(cleanPacketName, {
                    category: cleanPacketName,
                    values: mergedValues,
                    time: eventTime,
                });

                return;
            }

            categoryMap.set(cleanPacketName, {
                category: cleanPacketName,
                values: values,
                time: eventTime,
            });
        }
    });
}

export default function MinecraftMultiColumnStatisticTable({
    title,
    statisticDataProvider,
    statisticResolver,
    defaultSortOrder = MinecraftMultiColumnStatisticTableSortOrder.Descending,
    defaultSortType = MinecraftMultiColumnStatisticTableSortType.Numerical,
    defaultSortColumn,
    keyLabel,
    valueLabels,
    prettifyNames = true, // Default to prettifying names for backward compatibility
    columnWidths,
    actions,
    rowAction,
    nonConsolidatedColumnResolver,
    valueFormatter,
}: MinecraftMultiColumnStatisticTableProps): JSX.Element {
    // Memoize sort column options to prevent unnecessary recreations
    const sortColumnOptions = useMemo(
        () => [
            { id: MinecraftMultiColumnStatisticTableSortColumn.Key, label: keyLabel },
            ...valueLabels.map((label, index) => ({ id: `value_${index}`, label })),
        ],
        [keyLabel, valueLabels],
    );

    // states
    const [data, setData] = useState<MultiColumnTrackedStat[]>([]);
    const [selectedSortOrder, setSelectedSortOrder] =
        useState<MinecraftMultiColumnStatisticTableSortOrder>(defaultSortOrder);
    const [selectedSortType, setSelectedSortType] =
        useState<MinecraftMultiColumnStatisticTableSortType>(defaultSortType);
    const [selectedSortColumn, setSelectedSortColumn] = useState<string>(
        defaultSortColumn || MinecraftMultiColumnStatisticTableSortColumn.Key,
    );

    const _onSelectedSortOrderChange = useCallback((e: Event | React.FormEvent<HTMLElement>): void => {
        const target = e.target as HTMLSelectElement;
        setSelectedSortOrder(Number(target.value));
    }, []);

    const _onSelectedSortTypeChange = useCallback((e: Event | React.FormEvent<HTMLElement>): void => {
        const target = e.target as HTMLSelectElement;
        setSelectedSortType(Number(target.value));
    }, []);

    const _onSelectedSortColumnChange = useCallback((e: Event | React.FormEvent<HTMLElement>): void => {
        const target = e.target as HTMLSelectElement;
        setSelectedSortColumn(target.value);
    }, []);

    useEffect(() => {
        setSelectedSortOrder(defaultSortOrder);
    }, [defaultSortOrder]);

    useEffect(() => {
        setSelectedSortType(defaultSortType);
    }, [defaultSortType]);

    useEffect(() => {
        setSelectedSortColumn(defaultSortColumn || MinecraftMultiColumnStatisticTableSortColumn.Key);
    }, [defaultSortColumn]);

    useEffect(() => {
        const eventHandler = (event: StatisticUpdatedMessage): void => {
            // Update data with new data point
            setData((prevState: MultiColumnTrackedStat[]): MultiColumnTrackedStat[] => {
                const isConsolidatedDataEvent =
                    event.id === 'consolidated_data' &&
                    event.children_string_values &&
                    event.children_string_values.length > 0;

                // Group stats by category and collect values. For split metric streams,
                // preserve previous rows and merge in only the updated column.
                const categoryMap = new Map<string, MultiColumnTrackedStat>();

                if (!isConsolidatedDataEvent) {
                    prevState.forEach(previousRow => {
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

                // For consolidated_data events with children_string_values, skip the statisticResolver
                // and process the data directly since it's already in the correct format
                if (isConsolidatedDataEvent) {
                    processChildrenStringValues(
                        event.children_string_values,
                        categoryMap,
                        valueLabels,
                        prettifyNames,
                        event.time || Date.now(),
                        valueColumnIndex,
                    );
                } else {
                    // Use the statisticResolver for other event types
                    const rawStats = statisticResolver(event, []);

                    rawStats.forEach(stat => {
                        if (!stat.category) {
                            return;
                        }

                        const existing = categoryMap.get(stat.category);
                        if (existing) {
                            // Add value to existing category (ensuring we have enough slots)
                            while (existing.values.length < valueLabels.length) {
                                existing.values.push(0);
                            }
                            const targetColumn = valueColumnIndex as number;
                            existing.values[targetColumn] = stat.absoluteValue;
                            existing.time = Math.max(existing.time, stat.time);
                        } else {
                            // Create new entry
                            const newStat: MultiColumnTrackedStat = {
                                category: stat.category,
                                values: Array(valueLabels.length).fill(0),
                                time: stat.time,
                            };
                            const targetColumn = valueColumnIndex as number;
                            newStat.values[targetColumn] = stat.absoluteValue;
                            categoryMap.set(stat.category, newStat);
                        }
                    });

                    // Handle multi-value events (children_string_values) for non-consolidated events
                    if (event.children_string_values && event.children_string_values.length > 0) {
                        processChildrenStringValues(
                            event.children_string_values,
                            categoryMap,
                            valueLabels,
                            prettifyNames,
                            event.time || Date.now(),
                            valueColumnIndex,
                        );
                    }
                }

                let newData = Array.from(categoryMap.values());

                // Calculate the latest tick for each category
                const latestTicks = new Map<string, number>();
                newData.forEach(dataPoint => {
                    const currentTick = latestTicks.get(dataPoint.category) ?? 0;
                    if (dataPoint.time > currentTick) {
                        latestTicks.set(dataPoint.category, dataPoint.time);
                    }
                });

                // Filter out data points that are older than the latest tick
                newData = newData.filter(dataPoint => {
                    const latestTick = latestTicks.get(dataPoint.category);
                    return latestTick !== undefined && dataPoint.time === latestTick;
                });

                // Sort based on sortOrder, sortType, and sortColumn
                newData.sort((a, b) => {
                    let compareValue: number;

                    if (selectedSortColumn === MinecraftMultiColumnStatisticTableSortColumn.Key) {
                        // Sort by category name
                        if (selectedSortType === MinecraftMultiColumnStatisticTableSortType.Alphabetical) {
                            compareValue = a.category.localeCompare(b.category);
                        } else {
                            // For numerical sort on key, still use alphabetical
                            compareValue = a.category.localeCompare(b.category);
                        }
                    } else {
                        // Sort by specific value column
                        const columnIndex = parseInt(selectedSortColumn.replace('value_', ''));
                        if (columnIndex >= 0 && columnIndex < valueLabels.length) {
                            const aValue = a.values[columnIndex] ?? '';
                            const bValue = b.values[columnIndex] ?? '';

                            if (selectedSortType === MinecraftMultiColumnStatisticTableSortType.Alphabetical) {
                                compareValue = String(aValue).localeCompare(String(bValue));
                            } else {
                                // For numerical sort, convert to numbers if possible
                                const aNum = typeof aValue === 'number' ? aValue : parseFloat(String(aValue));
                                const bNum = typeof bValue === 'number' ? bValue : parseFloat(String(bValue));

                                if (isNaN(aNum) && isNaN(bNum)) {
                                    compareValue = String(aValue).localeCompare(String(bValue));
                                } else if (isNaN(aNum)) {
                                    compareValue = 1;
                                } else if (isNaN(bNum)) {
                                    compareValue = -1;
                                } else {
                                    compareValue = aNum - bNum;
                                }
                            }
                        } else {
                            compareValue = a.category.localeCompare(b.category);
                        }
                    }

                    return selectedSortOrder === MinecraftMultiColumnStatisticTableSortOrder.Ascending
                        ? compareValue
                        : -compareValue;
                });

                return newData;
            });
        };

        statisticDataProvider.registerWindowListener(window);
        statisticDataProvider.addSubscriber(eventHandler);

        // Remove old listener
        return () => {
            statisticDataProvider.removeSubscriber(eventHandler);
            statisticDataProvider.unregisterWindowListener(window);
        };
    }, [
        statisticDataProvider,
        statisticResolver,
        selectedSortOrder,
        selectedSortType,
        selectedSortColumn,
        valueLabels,
        prettifyNames,
    ]);

    return (
        <div>
            <h2>{title}</h2>
            {actions?.length && (
                <div className="minecraft-statistic-table-actions">
                    {actions.map(action => (
                        <VSCodeButton key={action.label} onClick={action.onClick}>
                            {action.label}
                        </VSCodeButton>
                    ))}
                </div>
            )}
            <div className="minecraft-statistic-table-container">
                <div className="minecraft-statistic-table-sort-container">
                    <label htmlFor="sort-order">Sort Order</label>
                    <VSCodeDropdown
                        id="sort-order"
                        onChange={_onSelectedSortOrderChange}
                        value={`${selectedSortOrder}`}
                    >
                        {sortOrderOptions.map(sortOption => (
                            <VSCodeOption key={sortOption.id} value={`${sortOption.id}`}>
                                {sortOption.label}
                            </VSCodeOption>
                        ))}
                    </VSCodeDropdown>
                </div>
                <div style={{ width: '10px' }}></div>
                <div className="minecraft-statistic-table-sort-container">
                    <label htmlFor="sort-type">Sort Type</label>
                    <VSCodeDropdown id="sort-type" onChange={_onSelectedSortTypeChange} value={`${selectedSortType}`}>
                        {sortTypeOptions.map(sortOption => (
                            <VSCodeOption key={sortOption.id} value={`${sortOption.id}`}>
                                {sortOption.label}
                            </VSCodeOption>
                        ))}
                    </VSCodeDropdown>
                </div>
                <div style={{ width: '10px' }}></div>
                <div className="minecraft-statistic-table-sort-container">
                    <label htmlFor="sort-column">Sort Column</label>
                    <VSCodeDropdown id="sort-column" onChange={_onSelectedSortColumnChange} value={selectedSortColumn}>
                        {sortColumnOptions.map(sortOption => (
                            <VSCodeOption key={sortOption.id} value={sortOption.id}>
                                {sortOption.label}
                            </VSCodeOption>
                        ))}
                    </VSCodeDropdown>
                </div>
            </div>
            <VSCodeDataGrid
                id="multi-column-grid"
                generate-header="sticky"
                style={
                    columnWidths
                        ? ({
                              '--col1-width': columnWidths[0] || '250px',
                              '--col2-width': columnWidths[1] || '120px',
                              '--col3-width': columnWidths[2] || '120px',
                              '--col4-width': columnWidths[3] || '120px',
                              '--col5-width': columnWidths[4] || '120px',
                              '--col6-width': columnWidths[5] || '120px',
                          } as React.CSSProperties)
                        : undefined
                }
            >
                <VSCodeDataGridRow rowType="header">
                    <VSCodeDataGridCell
                        cellType="columnheader"
                        gridColumn="1"
                        style={columnWidths ? { width: columnWidths[0] || '250px' } : undefined}
                    >
                        {keyLabel}
                    </VSCodeDataGridCell>
                    {valueLabels.map((label, index) => (
                        <VSCodeDataGridCell
                            key={index}
                            cellType="columnheader"
                            gridColumn={`${index + 2}`}
                            style={columnWidths ? { width: columnWidths[index + 1] || '120px' } : undefined}
                        >
                            {label}
                        </VSCodeDataGridCell>
                    ))}
                    {rowAction && (
                        <VSCodeDataGridCell
                            cellType="columnheader"
                            gridColumn={`${valueLabels.length + 2}`}
                            style={{ width: rowAction.width || '140px' }}
                        >
                            {rowAction.headerLabel || 'Action'}
                        </VSCodeDataGridCell>
                    )}
                </VSCodeDataGridRow>
                {data.map(dataPoint => (
                    <VSCodeDataGridRow key={dataPoint.category}>
                        <VSCodeDataGridCell
                            gridColumn="1"
                            style={columnWidths ? { width: columnWidths[0] || '250px' } : undefined}
                        >
                            {dataPoint.category}
                        </VSCodeDataGridCell>
                        {dataPoint.values.map((value, index) => (
                            <VSCodeDataGridCell
                                key={index}
                                gridColumn={`${index + 2}`}
                                style={columnWidths ? { width: columnWidths[index + 1] || '120px' } : undefined}
                            >
                                {valueFormatter
                                    ? valueFormatter(value, index)
                                    : typeof value === 'number'
                                      ? value.toFixed(1)
                                      : value}
                            </VSCodeDataGridCell>
                        ))}
                        {rowAction && (
                            <VSCodeDataGridCell
                                gridColumn={`${valueLabels.length + 2}`}
                                style={{ width: rowAction.width || '140px' }}
                            >
                                <VSCodeButton
                                    onClick={() => rowAction.onClick(dataPoint)}
                                    disabled={rowAction.disabled?.(dataPoint) ?? false}
                                >
                                    {rowAction.label}
                                </VSCodeButton>
                            </VSCodeDataGridCell>
                        )}
                    </VSCodeDataGridRow>
                ))}
            </VSCodeDataGrid>
        </div>
    );
}
