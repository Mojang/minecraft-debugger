// Copyright (C) Microsoft Corporation.  All rights reserved.

import { useCallback, useEffect, useState } from 'react';
import { MultipleStatisticProvider, StatisticUpdatedMessage } from '../StatisticProvider';
import { StatisticResolver, TrackedStat, YAxisStyle } from '../StatisticResolver';
import {
    VSCodeDataGrid,
    VSCodeDataGridRow,
    VSCodeDataGridCell,
    VSCodeDropdown,
    VSCodeOption,
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
};

const sortOrderOptions = [
    { id: MinecraftMultiColumnStatisticTableSortOrder.Ascending, label: 'Ascending' },
    { id: MinecraftMultiColumnStatisticTableSortOrder.Descending, label: 'Descending' },
];

const sortTypeOptions = [
    { id: MinecraftMultiColumnStatisticTableSortType.Alphabetical, label: 'Alphabetical' },
    { id: MinecraftMultiColumnStatisticTableSortType.Numerical, label: 'Numerical' },
];

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
}: MinecraftMultiColumnStatisticTableProps): JSX.Element {
    // states
    const [data, setData] = useState<MultiColumnTrackedStat[]>([]);
    const [selectedSortOrder, setSelectedSortOrder] =
        useState<MinecraftMultiColumnStatisticTableSortOrder>(defaultSortOrder);
    const [selectedSortType, setSelectedSortType] =
        useState<MinecraftMultiColumnStatisticTableSortType>(defaultSortType);
    const [selectedSortColumn, setSelectedSortColumn] = useState<string>(
        defaultSortColumn || MinecraftMultiColumnStatisticTableSortColumn.Key
    );

    // Create sort column options
    const sortColumnOptions = [
        { id: MinecraftMultiColumnStatisticTableSortColumn.Key, label: keyLabel },
        ...valueLabels.map((label, index) => ({ id: `value_${index}`, label })),
    ];

    const _onSelectedSortOrderChange = useCallback((e: Event | React.FormEvent<HTMLElement>): void => {
        const target = e.target as HTMLSelectElement;
        setSelectedSortOrder(sortOrderOptions[target.selectedIndex].id);
    }, []);

    const _onSelectedSortTypeChange = useCallback((e: Event | React.FormEvent<HTMLElement>): void => {
        const target = e.target as HTMLSelectElement;
        setSelectedSortType(sortTypeOptions[target.selectedIndex].id);
    }, []);

    const _onSelectedSortColumnChange = useCallback(
        (e: Event | React.FormEvent<HTMLElement>): void => {
            const target = e.target as HTMLSelectElement;
            setSelectedSortColumn(sortColumnOptions[target.selectedIndex].id);
        },
        [sortColumnOptions]
    );

    useEffect(() => {
        const eventHandler = (event: StatisticUpdatedMessage): void => {
            // Update data with new data point
            setData((_prevState: MultiColumnTrackedStat[]): MultiColumnTrackedStat[] => {
                // Group stats by category and collect values
                const categoryMap = new Map<string, MultiColumnTrackedStat>();

                // For consolidated_data events with children_string_values, skip the statisticResolver
                // and process the data directly since it's already in the correct format
                if (
                    event.id === 'consolidated_data' &&
                    event.children_string_values &&
                    event.children_string_values.length > 0
                ) {
                    event.children_string_values.forEach(childRow => {
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
                                      ?.replace(/^./, (str: string) => str.toUpperCase()) || // Capitalize first letter
                                  packetName
                                : packetName.split('::').pop() || packetName;

                            categoryMap.set(cleanPacketName, {
                                category: cleanPacketName,
                                values: values,
                                time: event.time || Date.now(),
                            });
                        }
                    });
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
                            while (existing.values.length <= valueLabels.length) {
                                existing.values.push(0);
                            }
                            existing.values[existing.values.length - 1] = stat.absoluteValue;
                            existing.time = Math.max(existing.time, stat.time);
                        } else {
                            // Create new entry
                            const newStat: MultiColumnTrackedStat = {
                                category: stat.category,
                                values: [stat.absoluteValue],
                                time: stat.time,
                            };
                            // Pad values array to match number of columns
                            while (newStat.values.length < valueLabels.length) {
                                newStat.values.push(0);
                            }
                            categoryMap.set(stat.category, newStat);
                        }
                    });

                    // Handle multi-value events (children_string_values) for non-consolidated events
                    if (event.children_string_values && event.children_string_values.length > 0) {
                        event.children_string_values.forEach(childRow => {
                            if (childRow.length >= 2) {
                                // Format: [packet_name, value1, value2, value3, ...]
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
                                          ?.replace(/^./, (str: string) => str.toUpperCase()) || // Capitalize first letter
                                      packetName
                                    : packetName.split('::').pop() || packetName;

                                categoryMap.set(cleanPacketName, {
                                    category: cleanPacketName,
                                    values: values,
                                    time: event.time,
                                });
                            }
                        });
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
    ]);

    return (
        <div>
            <h2>{title}</h2>
            <div className="minecraft-statistic-table-container">
                <div className="minecraft-statistic-table-sort-container">
                    <label htmlFor="sort-order">Sort Order</label>
                    <VSCodeDropdown
                        id="sort-order"
                        onChange={_onSelectedSortOrderChange}
                        defaultValue={sortOrderOptions.findIndex(elem => elem.id === selectedSortOrder)}
                    >
                        {sortOrderOptions.map(sortOption => (
                            <VSCodeOption key={sortOption.id}>{sortOption.label}</VSCodeOption>
                        ))}
                    </VSCodeDropdown>
                </div>
                <div style={{ width: '10px' }}></div>
                <div className="minecraft-statistic-table-sort-container">
                    <label htmlFor="sort-type">Sort Type</label>
                    <VSCodeDropdown
                        id="sort-type"
                        onChange={_onSelectedSortTypeChange}
                        defaultValue={sortTypeOptions.findIndex(elem => elem.id === selectedSortType)}
                    >
                        {sortTypeOptions.map(sortOption => (
                            <VSCodeOption key={sortOption.id}>{sortOption.label}</VSCodeOption>
                        ))}
                    </VSCodeDropdown>
                </div>
                <div style={{ width: '10px' }}></div>
                <div className="minecraft-statistic-table-sort-container">
                    <label htmlFor="sort-column">Sort Column</label>
                    <VSCodeDropdown
                        id="sort-column"
                        onChange={_onSelectedSortColumnChange}
                        defaultValue={sortColumnOptions.findIndex(elem => elem.id === selectedSortColumn)}
                    >
                        {sortColumnOptions.map(sortOption => (
                            <VSCodeOption key={sortOption.id}>{sortOption.label}</VSCodeOption>
                        ))}
                    </VSCodeDropdown>
                </div>
            </div>
            <VSCodeDataGrid id="multi-column-grid" generate-header="sticky">
                <VSCodeDataGridRow rowType="header">
                    <VSCodeDataGridCell cellType="columnheader" gridColumn="1">
                        {keyLabel}
                    </VSCodeDataGridCell>
                    {valueLabels.map((label, index) => (
                        <VSCodeDataGridCell key={index} cellType="columnheader" gridColumn={`${index + 2}`}>
                            {label}
                        </VSCodeDataGridCell>
                    ))}
                </VSCodeDataGridRow>
                {data.map(dataPoint => (
                    <VSCodeDataGridRow key={dataPoint.category}>
                        <VSCodeDataGridCell gridColumn="1">{dataPoint.category}</VSCodeDataGridCell>
                        {dataPoint.values.map((value, index) => (
                            <VSCodeDataGridCell key={index} gridColumn={`${index + 2}`}>
                                {typeof value === 'number' ? value.toFixed(1) : value}
                            </VSCodeDataGridCell>
                        ))}
                    </VSCodeDataGridRow>
                ))}
            </VSCodeDataGrid>
        </div>
    );
}
