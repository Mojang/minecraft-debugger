// Copyright (C) Microsoft Corporation.  All rights reserved.

import { useCallback, useEffect, useState } from 'react';
import { VSCodeDropdown, VSCodeOption } from '@vscode/webview-ui-toolkit/react';

type SelectionBoxProps = {
    labelName: string;
    statParentId: string;
    onChange: (selectedGroupId: string) => void;
};

interface StatGroupEntry {
    id: string;
    name: string;
}

type SelectedGroupId = string | undefined;

export function StatGroupSelectionBox({ labelName, statParentId, onChange }: SelectionBoxProps) {
    // the groups directly under the 'statParentId'
    const [groups, setGroup] = useState<StatGroupEntry[]>([]);
    const [selectedGroupId, setSelectedGroupId] = useState<SelectedGroupId>(undefined);

    const _onChange = useCallback(
        (e: Event | React.FormEvent<HTMLElement>): void => {
            const target = e.target as HTMLSelectElement;
            onChange(groups[target.selectedIndex].id);
        },
        [groups]
    );

    useEffect(() => {
        onChange(selectedGroupId || "");
    }, [selectedGroupId]);

    //draws chart
    useEffect(() => {
        const eventHandler = (e: MessageEvent): void => {
            // Object containing type prop and value prop
            const msg: MessageEvent = e;

            switch (msg.data.type) {
                case 'statistic-updated': {
                    if (msg.data.group !== statParentId) {
                        return;
                    }
                    // Add it to the list
                    setGroup(prevState => {
                        // See if the group is not in the list
                        if (
                            prevState === undefined ||
                            prevState?.findIndex(x => {
                                return x.id === msg.data.id;
                            }) === -1
                        ) {
                            const newState = [...(prevState ?? []), { id: msg.data.id, name: msg.data.name }];
                            // auto select the first group we get
                            if (!selectedGroupId && newState.length === 1) {
                                setSelectedGroupId(msg.data.id);
                                onChange(msg.data.id);
                            }
                            return newState;
                        }
                        return prevState;
                    });
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
            <label htmlFor="my-dropdown">{labelName}</label>
            <VSCodeDropdown id="my-dropdown" onChange={_onChange} disabled={groups.length === 0}>
                {(groups ?? []).map(option => (
                    <VSCodeOption key={option.id}>
                        {option.name}
                    </VSCodeOption>
                ))}
            </VSCodeDropdown>
        </div>
    );
}
