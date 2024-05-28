import { useRef, useEffect, useState, useMemo } from 'react';
import { VSCodeDropdown, VSCodeOption } from '@vscode/webview-ui-toolkit/react';

//chart component

type Options = {
    onChange: (pluginSelectionId: string) => void;
};

interface PluginEntry {
    id: string;
    name: string;
}

export default function ScriptPluginSelectionBox({ onChange }: Options) {
    // state
    const [pluginEntries, setPluginEntries] = useState<PluginEntry[]>([{ id: 'no_plugin_selected', name: 'n/a' }]);

    const eventHandler = (e: MessageEvent): void => {
        // Object containing type prop and value prop
        const msg: MessageEvent = e;

        switch (msg.data.type) {
            case 'statistic-updated': {
                if (msg.data.group !== 'handle_counts') {
                    return;
                }
                // Add it to the list
                setPluginEntries(prevState => {
                    // See if the plugin is not in the list
                    if (
                        prevState === undefined ||
                        prevState?.findIndex(x => {
                            return x.id === msg.data.id;
                        }) === -1
                    ) {
                        return [...(prevState ?? []), { id: msg.data.id, name: msg.data.name }];
                    }
                    return prevState;
                });
            }
        }
    };

    //draws chart
    useEffect(() => {
        window.addEventListener('message', eventHandler);

        // Remove listener
        return () => {
            window.removeEventListener('message', eventHandler);
        };
    });

    return (
        <div className="dropdown-container">
            <label htmlFor="my-dropdown">Script Plugin</label>
            <VSCodeDropdown
                id="my-dropdown"
                onChange={e => {
                    const target = e.target as HTMLSelectElement;
                    onChange(pluginEntries[target.selectedIndex].id);
                }}
            >
                {(pluginEntries ?? []).map(option => {
                    return <VSCodeOption key={option.id}>{option.name}</VSCodeOption>;
                })}
            </VSCodeDropdown>
        </div>
    );
}
