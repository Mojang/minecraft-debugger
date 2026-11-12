// Copyright (C) Microsoft Corporation.  All rights reserved.

import { useEffect, useState } from 'react';
import {
    VSCodeDataGrid,
    VSCodeDataGridCell,
    VSCodeDataGridRow,
    VSCodeTextField,
} from '@vscode/webview-ui-toolkit/react';
import { StatisticProvider, StatisticUpdatedMessage } from '../StatisticProvider';
import { matchesTableSearch } from '../../../../src/table-search';

function updateCachedData(propertyCache: Map<string, string>, data: string[][]): boolean {
    let hasChanges = false;

    if (propertyCache.size !== data.length) {
        propertyCache.clear();
        hasChanges = true;
    }

    for (let i = 0; i < data.length; i++) {
        const name = data[i][0];
        const value = data[i][1];

        if (!(name && value)) {
            console.error(`Invalid Dynamic Property - Name: ${name}, Value: ${value}`);
            continue;
        }

        const cachedValue = propertyCache.get(name);
        if (!cachedValue || (cachedValue && value !== cachedValue)) {
            propertyCache.set(name, value);
            hasChanges = true;
        }
    }

    return hasChanges;
}

type MinecraftDynamicPropertiesTableProps = {
    statisticDataProviders: StatisticProvider;
    showSearchBox?: boolean;
};

export function MinecraftDynamicPropertiesTable({
    statisticDataProviders,
    showSearchBox = false,
}: MinecraftDynamicPropertiesTableProps) {
    // the groups directly under the 'statParentId'
    const [dynamicValueCache, setDynamicValueCache] = useState<Map<string, string>>(new Map<string, string>());
    const [searchQuery, setSearchQuery] = useState('');

    //draws chart
    useEffect(() => {
        const eventHandler = (event: StatisticUpdatedMessage): void => {
            // Update data with new data point
            setDynamicValueCache((prevCache: Map<string, string>): Map<string, string> => {
                const propertyCache = new Map(prevCache);
                if (updateCachedData(propertyCache, event.children_string_values)) {
                    return propertyCache;
                }

                return prevCache;
            });
        };

        statisticDataProviders.registerWindowListener(window);
        statisticDataProviders.addSubscriber(eventHandler);

        // Remove old listener
        return () => {
            statisticDataProviders.removeSubscriber(eventHandler);
            statisticDataProviders.unregisterWindowListener(window);
        };
    }, [dynamicValueCache]);
    const visibleProperties = Array.from(dynamicValueCache.entries()).filter(([name, value]) =>
        matchesTableSearch(searchQuery, [name, value])
    );

    return (
        <>
            {showSearchBox && (
                <VSCodeTextField
                    value={searchQuery}
                    placeholder="Search table"
                    onInput={event => setSearchQuery((event.target as HTMLInputElement).value)}
                >
                    Search
                </VSCodeTextField>
            )}
            <VSCodeDataGrid id="my-grid">
                <VSCodeDataGridRow rowType="header">
                    <VSCodeDataGridCell cellType="columnheader" gridColumn={'1'}>
                        {'Name'}
                    </VSCodeDataGridCell>
                    <VSCodeDataGridCell cellType="columnheader" gridColumn={'2'}>
                        {'Value'}
                    </VSCodeDataGridCell>
                </VSCodeDataGridRow>
                {visibleProperties.map(([name, value]) => (
                    <VSCodeDataGridRow key={name}>
                        <VSCodeDataGridCell gridColumn={'1'}>{name}</VSCodeDataGridCell>
                        <VSCodeDataGridCell gridColumn={'2'}>{value}</VSCodeDataGridCell>
                    </VSCodeDataGridRow>
                ))}
            </VSCodeDataGrid>
        </>
    );
}
