// Copyright (C) Microsoft Corporation.  All rights reserved.

import { useEffect, useState } from 'react';
import { VSCodeDataGrid, VSCodeDataGridCell, VSCodeDataGridRow } from '@vscode/webview-ui-toolkit/react';
import { StatisticProvider, StatisticUpdatedMessage } from '../StatisticProvider';

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

export function MinecraftDynamicPropertiesTable(statisticDataProviders: Record<string, StatisticProvider>) {
    // the groups directly under the 'statParentId'
    const [dynamicValueCache, setDynamicValueCache] = useState<Map<string, string>>(new Map<string, string>());

    //draws chart
    useEffect(() => {
        const eventHandlersByName = new Map<string, (event: StatisticUpdatedMessage) => void>();

        Object.keys(statisticDataProviders).forEach(statisticDataProviderName => {
            const statsProvider = statisticDataProviders[statisticDataProviderName];
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

            statsProvider.registerWindowListener(window);
            statsProvider.addSubscriber(eventHandler);

            eventHandlersByName.set(statisticDataProviderName, eventHandler);
        });

        // Remove old listener
        return () => {
            Object.keys(statisticDataProviders).forEach(statisticDataProviderName => {
                const statsProvider = statisticDataProviders[statisticDataProviderName];

                const eventHandler = eventHandlersByName.get(statisticDataProviderName);
                if (eventHandler) {
                    statsProvider.removeSubscriber(eventHandler);
                }
                statsProvider.unregisterWindowListener(window);
            });
        };
    }, [dynamicValueCache]);
    return (
        <VSCodeDataGrid id="my-grid">
            <VSCodeDataGridRow rowType="header">
                <VSCodeDataGridCell cellType="columnheader" gridColumn={'1'}>
                    {'Name'}
                </VSCodeDataGridCell>
                <VSCodeDataGridCell cellType="columnheader" gridColumn={'2'}>
                    {'Value'}
                </VSCodeDataGridCell>
            </VSCodeDataGridRow>
            {Array.from(dynamicValueCache.entries()).map(event => (
                <VSCodeDataGridRow>
                    <VSCodeDataGridCell gridColumn={'1'}>{`${event[0]}`}</VSCodeDataGridCell>
                    <VSCodeDataGridCell gridColumn={'2'}>{`${event[1]}`}</VSCodeDataGridCell>
                </VSCodeDataGridRow>
            ))}
        </VSCodeDataGrid>
    );
}
