import { useMemo, useState } from 'react';
import { MultipleStatisticProvider, StatisticUpdatedMessage } from '../../StatisticProvider';
import { TabPrefab, TabPrefabDataSource, TabPrefabParams } from '../TabPrefab';
import MinecraftProfilerFlameStreamChart from '../../controls/MinecraftProfilerFlameStreamChart';
import {
    DebuggerRequestResultMessage,
    getDebuggerRequestResult,
    isDebuggerRequestInFlight,
    sendDebuggerRequest,
    useDebuggerRequestUpdates,
} from '../../utilities/useDebuggerRequests';
import { DebuggerRequestResultBanner } from '../../controls/DebuggerRequestResult';
import { VSCodeButton } from '@vscode/webview-ui-toolkit/react';

const DEBUGGER_REQUEST_COMMANDS = [
    { command: 'Start CPU Profiler', label: 'Start' },
    { command: 'Stop CPU Profiler', label: 'Stop' },
];

function isWhiskerEvent(event: StatisticUpdatedMessage): boolean {
    return event.group === 'low' || event.group === 'mid' || event.group === 'high' || event.group === 'indents';
}

const StatsTab: TabPrefab = {
    name: 'Client - CPU Profiler',
    dataSource: TabPrefabDataSource.Client,
    content: ({ selectedClient }: TabPrefabParams) => {
        useDebuggerRequestUpdates();
        const [lastRequestedCommand, setLastRequestedCommand] = useState<string>('');
        const lastResult: DebuggerRequestResultMessage | undefined = lastRequestedCommand
            ? getDebuggerRequestResult(lastRequestedCommand)
            : undefined;

        const statisticDataProvider = useMemo(
            () =>
                new MultipleStatisticProvider({
                    statisticParentId: new RegExp(`.*${selectedClient}.*whisker.*`),
                    valuesFilter: event =>
                        isWhiskerEvent(event) && (event.children_string_values.length > 0 || event.values.length > 0),
                }),
            [selectedClient],
        );

        return (
            <div>
                <div style={{ flexDirection: 'column', display: 'flex', width: '100%' }}>
                    <div style={{ flex: 1, margin: '5px' }}>
                        <h2>CPU Profiler Controls</h2>
                        {DEBUGGER_REQUEST_COMMANDS.map(command => {
                            const inFlight = isDebuggerRequestInFlight(command.command);
                            return (
                                <VSCodeButton
                                    key={command.command}
                                    disabled={inFlight}
                                    onClick={() => {
                                        setLastRequestedCommand(command.command);
                                        sendDebuggerRequest(command.command);
                                    }}
                                    style={{ margin: '5px' }}
                                >
                                    {command.label}
                                </VSCodeButton>
                            );
                        })}
                        <div style={{ marginTop: '20px' }}>
                            <DebuggerRequestResultBanner lastResult={lastResult} />
                        </div>
                    </div>
                </div>
                <div style={{ flexDirection: 'row', display: 'flex', width: '100%' }}>
                    <MinecraftProfilerFlameStreamChart
                        title="Profiler Scopes"
                        statisticDataProvider={statisticDataProvider}
                    />
                </div>
            </div>
        );
    },
};

export default StatsTab;
