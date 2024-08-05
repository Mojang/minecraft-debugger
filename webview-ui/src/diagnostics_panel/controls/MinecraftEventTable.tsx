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

const MAX_EVENTS = 100;

export function MinecraftEventTable({ title, statisticDataProviders }: SelectionBoxProps) {
    // the groups directly under the 'statParentId'
    const [events, setEvents] = useState<EventTick[]>([]);

    //draws chart
    useEffect(() => {
        const eventHandlersByName = new Map<string, (event: StatisticUpdatedMessage) => void>();

        Object.keys(statisticDataProviders).forEach(statisticDataProviderName => {
            const statsProvider = statisticDataProviders[statisticDataProviderName];
            const eventHandler = (event: StatisticUpdatedMessage): void => {
                // Update data with new data point
                setEvents((prevState: EventTick[]): EventTick[] => {
                    const newState = [...prevState];

                    const eventTick = newState.find(eventTick => eventTick.tick === event.time);
                    if (eventTick === undefined) {
                        newState.push({
                            tick: event.time,
                            events: {
                                [statisticDataProviderName]: [event],
                            },
                        });
                    } else {
                        const events = eventTick.events[statisticDataProviderName];
                        if (events === undefined) {
                            eventTick.events[statisticDataProviderName] = [event];
                        } else {
                            events.push(event);
                        }
                    }

                    // Sort the data by tick
                    newState.sort((a, b) => {
                        return a.tick - b.tick;
                    });

                    // Remove old data
                    while (newState.length > MAX_EVENTS) {
                        newState.shift();
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

    return (
        <VSCodeDataGrid id="my-grid">
            <VSCodeDataGridRow rowType="header">
                <VSCodeDataGridCell cellType="columnheader" gridColumn="1">
                    Tick
                </VSCodeDataGridCell>
                {Object.keys(statisticDataProviders).map((statisticDataProviderName, index) => {
                    return (
                        <VSCodeDataGridCell cellType="columnheader" gridColumn={(index + 2).toString()}>
                            {statisticDataProviderName}
                        </VSCodeDataGridCell>
                    );
                })}
            </VSCodeDataGridRow>
            {events.map(eventTick => (
                <VSCodeDataGridRow>
                    <VSCodeDataGridCell gridColumn="1">{eventTick.tick}</VSCodeDataGridCell>
                    {Object.keys(statisticDataProviders).map((statisticDataProviderName, index) => {
                        return (
                            <VSCodeDataGridCell gridColumn={(index + 2).toString()}>
                                {eventTick.events[statisticDataProviderName]?.map(event => {
                                    return (
                                        <a>
                                            {`${event.group_name}${
                                                event.values.length > 1 ? ` x${event.values.length}` : ''
                                            }`}
                                            <br />
                                        </a>
                                    );
                                })}
                            </VSCodeDataGridCell>
                        );
                    })}
                </VSCodeDataGridRow>
            ))}
        </VSCodeDataGrid>
    );
}
