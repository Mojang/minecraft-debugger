// Copyright (C) Microsoft Corporation.  All rights reserved.

import { VSCodePanelTab, VSCodePanelView, VSCodePanels } from '@vscode/webview-ui-toolkit/react';
import { StatGroupSelectionBox } from './controls/StatGroupSelectionBox';
import { useCallback, useEffect, useState } from 'react';
import ReplayControls from './controls/ReplayControls';
import { Icons } from './Icons';
import './App.css';
import tabPrefabs from './prefabs';
import { TabPrefabDataSource } from './prefabs/TabPrefab';
import { handleDebuggerRequestResult } from './utilities/useDebuggerRequests';
import { vscode } from './utilities/vscode';

declare global {
    interface Window {
        initialParams: any;
    }
}

interface VSCodePanelsChangeEvent extends Event {
    target: EventTarget & { activeid: string };
}

const onRestart = () => {
    vscode.postMessage({ type: 'restart' });
};

const onSlower = () => {
    vscode.postMessage({ type: 'slower' });
};

const onFaster = () => {
    vscode.postMessage({ type: 'faster' });
};

const onPause = () => {
    vscode.postMessage({ type: 'pause' });
};

const onResume = () => {
    vscode.postMessage({ type: 'resume' });
};

const onRunCommand = (command: string) => {
    vscode.postMessage({ type: 'run-minecraft-command', command: command });
};

function App() {
    const [selectedPlugin, setSelectedPlugin] = useState<string>('');
    const [selectedClient, setSelectedClient] = useState<string>('');
    const [currentTab, setCurrentTab] = useState<string>();
    const [paused, setPaused] = useState<boolean>(true);
    const [speed, setSpeed] = useState<string>('');

    const handlePluginSelection = useCallback((pluginSelectionId: string) => {
        setSelectedPlugin(() => pluginSelectionId);
    }, []);

    const handleClientSelection = useCallback((clientSelectionId: string) => {
        setSelectedClient(() => clientSelectionId);
    }, []);

    const handlePanelChange = useCallback((event: VSCodePanelsChangeEvent): void => {
        const newTabId = event.target.activeid;
        if (newTabId) {
            setCurrentTab(newTabId);
        }
    }, []);

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            const message = event.data;
            if (message.type === 'speed-updated') {
                setSpeed(`${message.speed}hz`);
            } else if (message.type === 'pause-updated') {
                setPaused(message.paused);
            } else if (message.type === 'debugger-request-result') {
                handleDebuggerRequestResult(message);
            }
        };
        window.addEventListener('message', handleMessage);
        return () => {
            window.removeEventListener('message', handleMessage);
        };
    }, [handleDebuggerRequestResult]);

    return (
        <main>
            {window.initialParams.showReplayControls && (
                <ReplayControls
                    speed={speed}
                    paused={paused}
                    onRestart={onRestart}
                    onPause={onPause}
                    onResume={onResume}
                    onSlower={onSlower}
                    onFaster={onFaster}
                    svgIcons={Icons}
                />
            )}
            <VSCodePanels activeid={currentTab} onChange={event => handlePanelChange(event as VSCodePanelsChangeEvent)}>
                {tabPrefabs.map((tabPrefab, index) => (
                    <VSCodePanelTab id={`tab-${index}`}>{tabPrefab.name}</VSCodePanelTab>
                ))}
                {tabPrefabs.map((tabPrefab, index) => (
                    <VSCodePanelView id={`view-${index}`} style={{ flexDirection: 'column' }}>
                        {tabPrefab.dataSource === TabPrefabDataSource.Client ? (
                            <StatGroupSelectionBox
                                labelName="Client"
                                statParentId="client_stats"
                                onChange={handleClientSelection}
                            />
                        ) : (
                            <div />
                        )}
                        {tabPrefab.dataSource === TabPrefabDataSource.ServerScript ? (
                            <StatGroupSelectionBox
                                labelName="Script Plugin"
                                statParentId="handle_counts"
                                onChange={handlePluginSelection}
                            />
                        ) : (
                            <div />
                        )}
                        {tabPrefab.content({
                            selectedClient,
                            selectedPlugin,
                            onRunCommand,
                        })}
                    </VSCodePanelView>
                ))}
            </VSCodePanels>
        </main>
    );
}

export default App;
