import { EventEmitter } from 'stream';
import { describe, expect, it, vi } from 'vitest';
import { Memento, Uri } from 'vscode';
import { MinecraftDiagnosticsPanel } from './minecraft-diagnostics';
import { StatsProvider } from '../stats/stats-provider';
import { DiagnosticsTabDescriptor } from '../diagnostics-schema';

const MOCKS = vi.hoisted(() => ({
    postMessage: vi.fn(),
    onDidReceiveMessage: vi.fn<(handler: (message: { type: string }) => void) => void>(),
    onDidDispose: vi.fn<(handler: () => void) => void>(),
}));

/* eslint-disable @typescript-eslint/naming-convention -- Mocked exports match the VS Code API. */
vi.mock('vscode', () => ({
    ViewColumn: { Active: -1, One: 1 },
    Uri: { file: () => 'extension', joinPath: () => 'asset' },
    window: {
        createWebviewPanel: () => ({
            webview: {
                html: '',
                postMessage: MOCKS.postMessage,
                onDidReceiveMessage: MOCKS.onDidReceiveMessage,
            },
            onDidDispose: MOCKS.onDidDispose,
            dispose: vi.fn(),
        }),
    },
}));
/* eslint-enable @typescript-eslint/naming-convention */
vi.mock('../utilities/getUri', () => ({ getUri: () => 'asset' }));

describe('MinecraftDiagnosticsPanel', () => {
    it('resends the current schema after the webview is ready, restarted, or cleared', () => {
        const provider = new StatsProvider('test', 'ready-test');
        vi.spyOn(provider, 'stop').mockImplementation(vi.fn());
        const globalState: Memento = { keys: () => [], get: vi.fn(), update: vi.fn() };
        const schema: DiagnosticsTabDescriptor[] = [
            {
                name: 'Already in world',
                stat_group_id: 'scripting_stats_root',
                data_source: 'server',
                display_type: 'table',
                statistic_id: 'First',
            },
        ];
        provider.setSchema(schema);
        MinecraftDiagnosticsPanel.render(Uri.file('extension'), provider, new EventEmitter(), globalState);
        const receiveMessage = MOCKS.onDidReceiveMessage.mock.calls[0][0];

        // The initial post may arrive before React has installed its listener.
        MOCKS.postMessage.mockClear();
        receiveMessage({ type: 'diagnostics-ready' });
        expect(MOCKS.postMessage).toHaveBeenCalledWith({ type: 'diagnostics-schema', schema });

        receiveMessage({ type: 'restart' });
        MOCKS.postMessage.mockClear();
        receiveMessage({ type: 'diagnostics-ready' });
        expect(MOCKS.postMessage).toHaveBeenCalledTimes(1);
        expect(MOCKS.postMessage).toHaveBeenCalledWith({ type: 'diagnostics-schema', schema });

        provider.clearSchema();
        MOCKS.postMessage.mockClear();
        receiveMessage({ type: 'diagnostics-ready' });
        expect(MOCKS.postMessage).toHaveBeenCalledWith({ type: 'diagnostics-schema', schema: [] });
        MOCKS.onDidDispose.mock.calls[0][0]();
    });
});
