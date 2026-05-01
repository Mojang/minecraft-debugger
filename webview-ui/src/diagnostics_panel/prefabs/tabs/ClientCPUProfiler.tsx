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
import { VSCodeButton } from '@vscode/webview-ui-toolkit/react';

const DEBUGGER_REQUEST_COMMANDS = [
    { command: 'Start CPU Profiler', label: 'Start' },
    { command: 'Stop CPU Profiler', label: 'Stop' },
];

function lastResultToUserFriendlyString(lastResult: DebuggerRequestResultMessage): string {
    if (lastResult.error) {
        return `Error: ${lastResult.error}`;
    } else if (lastResult.response) {
        if (lastResult.response.success) {
            return `${lastResult.response.response_message}`;
        } else {
            return `Failed: ${lastResult.response.response_message}`;
        }
    } else {
        return 'Press Start to Begin Profiling';
    }
}

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
                <div style={{ flexDirection: 'column', display: 'flex', width: '25%' }}>
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
                            <text style={{ fontStyle: 'italic' }}>
                                {lastResult
                                    ? lastResultToUserFriendlyString(lastResult)
                                    : 'Press Start to Begin Profiling'}
                            </text>
                        </div>
                    </div>
                </div>
                <div style={{ flexDirection: 'row', display: 'flex', width: '75%' }}>
                    <MinecraftProfilerFlameStreamChart
                        title="Profiler Scopes"
                        statisticDataProvider={statisticDataProvider}
                        tickRange={20 * 60}
                        defaultWindowTicks={20 * 20}
                    />
                </div>
            </div>
        );
    },
};

export default StatsTab;
