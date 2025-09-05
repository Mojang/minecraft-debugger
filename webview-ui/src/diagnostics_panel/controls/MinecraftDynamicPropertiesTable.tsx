// Copyright (C) Microsoft Corporation.  All rights reserved.

import { useEffect, useState } from 'react';
import { VSCodeDataGrid, VSCodeDataGridCell, VSCodeDataGridRow } from '@vscode/webview-ui-toolkit/react';
import { StatisticProvider, StatisticUpdatedMessage } from '../StatisticProvider';

type DynamicProperty = {
    tick: number;
    name: string;
    value: string;
};

export function MinecraftDynamicPropertiesTable(statisticDataProviders: Record<string, StatisticProvider>) {
    // the groups directly under the 'statParentId'
    const [events, setEvents] = useState<string[][]>([]);

    //draws chart
    useEffect(() => {
        const eventHandlersByName = new Map<string, (event: StatisticUpdatedMessage) => void>();

        Object.keys(statisticDataProviders).forEach(statisticDataProviderName => {
            const statsProvider = statisticDataProviders[statisticDataProviderName];
            const eventHandler = (event: StatisticUpdatedMessage): void => {
                // Update data with new data point
                setEvents(() => {
                    return event.children_string_values;
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
    }, [events]);
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
            {events.map(event => (
                <VSCodeDataGridRow>
                    <VSCodeDataGridCell gridColumn={'1'}>{`${event[0]}`}</VSCodeDataGridCell>
                    <VSCodeDataGridCell gridColumn={'2'}>{`${event[1]}`}</VSCodeDataGridCell>
                </VSCodeDataGridRow>
            ))}
        </VSCodeDataGrid>
    );
}
