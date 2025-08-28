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
    const [events, setEvents] = useState<DynamicProperty[]>([]);

    //draws chart
    useEffect(() => {
        const eventHandlersByName = new Map<string, (event: StatisticUpdatedMessage) => void>();

        Object.keys(statisticDataProviders).forEach(statisticDataProviderName => {
            const statsProvider = statisticDataProviders[statisticDataProviderName];
            const eventHandler = (event: StatisticUpdatedMessage): void => {
                // Update data with new data point
                setEvents((prevState: DynamicProperty[]): DynamicProperty[] => {
                    const newState = [...prevState];

                    if (
                        event === undefined ||
                        event.time === undefined ||
                        event.string_values === undefined ||
                        event.string_values[0] === undefined ||
                        event.string_values[1] === undefined
                    ) {
                        return [];
                    }

                    const currentTick = event.time;
                    let isNewVariable = true;
                    for (let i = 0; i < newState.length; i++) {
                        if (newState[i].name === event.string_values[0]) {
                            newState[i].value = event.string_values[1];
                            newState[i].tick = currentTick;
                            isNewVariable = false;
                            break;
                        }
                    }

                    if (isNewVariable) {
                        const newProp: DynamicProperty = {
                            tick: currentTick,
                            name: event.string_values[0],
                            value: event.string_values[1],
                        };
                        newState.push(newProp);
                    }

                    const cleanState: DynamicProperty[] = [];
                    for (let i = 0; i < newState.length; i++) {
                        if (newState[i].tick === currentTick) {
                            cleanState.push(newState[i]);
                        }
                    }

                    return cleanState;
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
                    <VSCodeDataGridCell gridColumn={'1'}>{`${event.name}`}</VSCodeDataGridCell>
                    <VSCodeDataGridCell gridColumn={'2'}>{`${event.value}`}</VSCodeDataGridCell>
                </VSCodeDataGridRow>
            ))}
        </VSCodeDataGrid>
    );
}
