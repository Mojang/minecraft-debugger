// Copyright (C) Microsoft Corporation.  All rights reserved.

import { useCallback, useEffect, useState } from 'react';
import { VSCodeDropdown, VSCodeOption } from '@vscode/webview-ui-toolkit/react';

type SelectionBoxProps = {
    labelName: string;
    statParentId: string;
    onChange: (selectedGroupId: string) => void;
    helpTooltip?: string;
};

interface StatGroupEntry {
    id: string;
    name: string;
}

export function StatGroupSelectionBox({ labelName, statParentId, onChange, helpTooltip }: SelectionBoxProps) {
    // the groups directly under the 'statParentId'
    const [groups, setGroup] = useState<StatGroupEntry[]>([]);
    const [selectedGroupId, setSelectedGroupId] = useState<string | undefined>(undefined);

    const _onChange = useCallback(
        (e: Event | React.FormEvent<HTMLElement>): void => {
            const target = e.target as HTMLSelectElement;
            onChange(groups[target.selectedIndex].id);
        },
        [groups],
    );

    useEffect(() => {
        onChange(selectedGroupId || '');
    }, [selectedGroupId]);

    //draws chart
    useEffect(() => {
        const handleStatistic = (statistic: {
            group: string;
            id: string;
            name: string;
        }): void => {
            if (statistic.group !== statParentId) {
                return;
            }
            // Add it to the list
            setGroup(prevState => {
                const isNewGroup = !prevState || prevState.findIndex(x => x.id === statistic.id) === -1;
                if (isNewGroup) {
                    // auto select the first group we get if nothing selected
                    if (!selectedGroupId) {
                        setSelectedGroupId(statistic.id);
                    }
                    // add new group to end of list
                    const newState = [...(prevState ?? []), { id: statistic.id, name: statistic.name }];
                    return newState;
                }
                return prevState;
            });
        };

        const eventHandler = (e: MessageEvent): void => {
            const message = e.data;
            if (message.type === 'statistic-updated-batch' && Array.isArray(message.events)) {
                for (const statistic of message.events) {
                    handleStatistic(statistic);
                }
            }
        };

        window.addEventListener('message', eventHandler);

        // Remove listener
        return () => {
            window.removeEventListener('message', eventHandler);
        };
    }, [groups]);

    return (
        <div className="dropdown-container">
            <label htmlFor="my-dropdown" className="stat-group-selection-label">
                <span>{labelName}</span>
                {helpTooltip && (
                    <span className="stat-group-selection-help" title={helpTooltip} aria-label={`${labelName} help`}>
                        ?
                    </span>
                )}
            </label>
            <VSCodeDropdown id="my-dropdown" onChange={_onChange} disabled={groups.length === 0}>
                {(groups ?? []).map(option => (
                    <VSCodeOption key={option.id}>{option.name}</VSCodeOption>
                ))}
            </VSCodeDropdown>
        </div>
    );
}
