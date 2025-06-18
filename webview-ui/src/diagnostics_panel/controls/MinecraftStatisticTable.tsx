// Copyright (C) Microsoft Corporation.  All rights reserved.

import { useCallback, useEffect, useState } from 'react';
import { StatisticProvider, StatisticUpdatedMessage } from '../StatisticProvider';
import { StatisticResolver, TrackedStat, YAxisStyle } from '../StatisticResolver';
import {
    VSCodeDataGrid,
    VSCodeDataGridRow,
    VSCodeDataGridCell,
    VSCodeDropdown,
    VSCodeOption,
} from '@vscode/webview-ui-toolkit/react';

export enum MinecraftStatisticTableSortOrder {
    Ascending,
    Descending,
}

export enum MinecraftStatisticTableSortType {
    Alphabetical,
    Numerical,
}

type MinecraftStatisticTableProps = {
    title: string;
    statisticDataProvider: StatisticProvider;
    statisticResolver: StatisticResolver;
    defaultSortOrder?: MinecraftStatisticTableSortOrder;
    defaultSortType?: MinecraftStatisticTableSortType;

    keyLabel: string;
    valueLabel: string;
};

const sortOrderOptions = [
    { id: MinecraftStatisticTableSortOrder.Ascending, label: 'Ascending' },
    { id: MinecraftStatisticTableSortOrder.Descending, label: 'Descending' },
];

const sortTypeOptions = [
    { id: MinecraftStatisticTableSortType.Alphabetical, label: 'Alphabetical' },
    { id: MinecraftStatisticTableSortType.Numerical, label: 'Numerical' },
];

export default function MinecraftStatisticTable({
    title,
    statisticDataProvider,
    statisticResolver,
    defaultSortOrder = MinecraftStatisticTableSortOrder.Descending,
    defaultSortType = MinecraftStatisticTableSortType.Numerical,
    keyLabel,
    valueLabel,
}: MinecraftStatisticTableProps): JSX.Element {
    // states
    const [data, setData] = useState<TrackedStat[]>([]);

    const [selectedSortOrder, setSelectedSortOrder] = useState<MinecraftStatisticTableSortOrder>(defaultSortOrder);
    const [selectedSortType, setSelectedSortType] = useState<MinecraftStatisticTableSortType>(defaultSortType);

    const _onSelectedSortOrderChange = useCallback((e: Event | React.FormEvent<HTMLElement>): void => {
        const target = e.target as HTMLSelectElement;
        setSelectedSortOrder(sortOrderOptions[target.selectedIndex].id);
    }, []);

    const _onSelectedSortTypeChange = useCallback((e: Event | React.FormEvent<HTMLElement>): void => {
        const target = e.target as HTMLSelectElement;
        setSelectedSortType(sortTypeOptions[target.selectedIndex].id);
    }, []);

    useEffect(() => {
        const eventHandler = (event: StatisticUpdatedMessage): void => {
            // Update data with new data point
            setData((prevState: TrackedStat[]): TrackedStat[] => {
                let newData = statisticResolver(event, prevState);

                // Calculate the latest tick for each category, as some content might come from different ticks
                const latestTicks = new Map<string, number>();
                newData.forEach(dataPoint => {
                    const currentTick = latestTicks.get(dataPoint.category!) ?? 0;
                    if (dataPoint.time > currentTick) {
                        latestTicks.set(dataPoint.category!, dataPoint.time);
                    }
                });

                // Filter out data points that are older than the latest tick
                newData = newData.filter(dataPoint => {
                    const latestTick = latestTicks.get(dataPoint.category!);
                    return latestTick !== undefined && dataPoint.time === latestTick;
                });

                // Sort based on sortOrder and sortType
                newData.sort((a, b) => {
                    if (selectedSortType === MinecraftStatisticTableSortType.Alphabetical) {
                        return selectedSortOrder === MinecraftStatisticTableSortOrder.Ascending
                            ? a.category!.localeCompare(b.category!)
                            : b.category!.localeCompare(a.category!);
                    } else {
                        return selectedSortOrder === MinecraftStatisticTableSortOrder.Ascending
                            ? a.absoluteValue - b.absoluteValue
                            : b.absoluteValue - a.absoluteValue;
                    }
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
    }, [statisticDataProvider, selectedSortOrder, selectedSortType]);

    return (
        <div>
            <h2>{title}</h2>
            <div style={{ flexDirection: 'row', display: 'flex', width: '100%' }}>
                <div className="sort-order-container" style={{ flexDirection: 'column', display: 'flex' }}>
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
                <div className="sort-type-container" style={{ flexDirection: 'column', display: 'flex' }}>
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
            </div>
            <VSCodeDataGrid id="my-grid">
                <VSCodeDataGridRow rowType="header">
                    <VSCodeDataGridCell cellType="columnheader" gridColumn="1">
                        {keyLabel}
                    </VSCodeDataGridCell>
                    <VSCodeDataGridCell cellType="columnheader" gridColumn="2">
                        {valueLabel}
                    </VSCodeDataGridCell>
                </VSCodeDataGridRow>
                {data.map(dataPoint => (
                    <VSCodeDataGridRow key={dataPoint.category}>
                        <VSCodeDataGridCell gridColumn="1">{dataPoint.category}</VSCodeDataGridCell>
                        <VSCodeDataGridCell gridColumn="2">{dataPoint.absoluteValue.toFixed(1)}</VSCodeDataGridCell>
                    </VSCodeDataGridRow>
                ))}
            </VSCodeDataGrid>
        </div>
    );
}
