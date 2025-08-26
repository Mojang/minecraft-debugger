// Copyright (C) Microsoft Corporation.  All rights reserved.

import { useEffect, useRef, useState } from 'react';
import { VSCodeDataGrid, VSCodeDataGridCell, VSCodeDataGridRow } from '@vscode/webview-ui-toolkit/react';
import { StatisticProvider, StatisticUpdatedMessage } from '../StatisticProvider';
import { DataGrid } from '@vscode/webview-ui-toolkit';

type SelectionBoxProps = {
    title: string;
    statisticDataProviders: Record<string, StatisticProvider>;
};

type EventTick = {
    tick: number;
    events: Record<string, StatisticUpdatedMessage[]>;
};

type DynamicProperty = {
    name: string;
    value: string;
};

const MAX_EVENTS = 100;

export function MinecraftEventTable({ title, statisticDataProviders }: SelectionBoxProps) {
    // the groups directly under the 'statParentId'
    const [events, setEvents] = useState<DynamicProperty[]>([]);

    //draws chart
    useEffect(() => {
        const eventHandlersByName = new Map<string, (event: StatisticUpdatedMessage) => void>();

        Object.keys(statisticDataProviders).forEach(statisticDataProviderName => {
            console.warn(JSON.stringify(event));
            const statsProvider = statisticDataProviders[statisticDataProviderName];
            const eventHandler = (event: StatisticUpdatedMessage): void => {
                // Update data with new data point
                setEvents((prevState: DynamicProperty[]): DynamicProperty[] => {
                    const newState = [...prevState];

                    let isNewVariable = true;
                    for (let i = 0; i < newState.length; i++) {
                        if (newState[i].name === event.string_values[0]) {
                            newState[i].value = event.string_values[1];
                            isNewVariable = false;
                            break;
                        }
                    }

                    if (isNewVariable) {
                        const newProp: DynamicProperty = {
                            name: event.string_values[0],
                            value: event.string_values[1],
                        };
                        newState.push(newProp);
                    }

                    return newState;
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
    console.warn(JSON.stringify(events));
    return (
        <VSCodeDataGrid id="my-grid">
            <VSCodeDataGridRow rowType="header">
                <VSCodeDataGridCell cellType="columnheader" gridColumn="1">
                    Tick
                </VSCodeDataGridCell>
                <VSCodeDataGridCell cellType="columnheader" gridColumn={(2).toString()}>
                    {'Name'}
                </VSCodeDataGridCell>
                <VSCodeDataGridCell cellType="columnheader" gridColumn={(3).toString()}>
                    {'Value'}
                </VSCodeDataGridCell>
            </VSCodeDataGridRow>
            {events.map(event => (
                <VSCodeDataGridRow>
                    <VSCodeDataGridCell gridColumn="1">{0}</VSCodeDataGridCell>
                    <VSCodeDataGridCell gridColumn={(2).toString()}>{`${event.name}`}</VSCodeDataGridCell>
                    <VSCodeDataGridCell gridColumn={(3).toString()}>{`${event.value}`}</VSCodeDataGridCell>
                </VSCodeDataGridRow>
            ))}
        </VSCodeDataGrid>
    );
}
