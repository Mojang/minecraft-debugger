// Copyright (C) Microsoft Corporation.  All rights reserved.

import { Disposable, Memento, Webview, WebviewPanel, window, workspace, Uri, ViewColumn } from 'vscode';
import { EventEmitter } from 'stream';
import { getUri } from '../utilities/getUri';
import { getNonce } from '../utilities/getNonce';
import { DebuggerRequestHandler } from '../requests/debugger-request-handler';
import { StatData, StatsListener, StatsProvider } from '../stats/stats-provider';
import { DiagnosticsTabDescriptor } from '../diagnostics-schema';

const DIAGNOSTICS_TAB_STATES_KEY = 'minecraftDiagnosticsTabStates';
type DiagnosticsTabStates = Record<string, boolean>;

export class MinecraftDiagnosticsPanel {
    private static activeDiagnosticsPanels: MinecraftDiagnosticsPanel[] = [];

    private readonly _panel: WebviewPanel;
    private _disposables: Disposable[] = [];
    private _statsTracker: StatsProvider;
    private _statsCallback: StatsListener | undefined = undefined;
    private _eventEmitter: EventEmitter;
    private _debuggerRequestHandler: DebuggerRequestHandler;

    private constructor(
        panel: WebviewPanel,
        extensionUri: Uri,
        statsTracker: StatsProvider,
        eventEmitter: EventEmitter,
        debuggerRequestHandler: DebuggerRequestHandler,
        private readonly _globalState: Memento,
    ) {
        this._panel = panel;
        this._statsTracker = statsTracker;
        this._eventEmitter = eventEmitter;
        this._debuggerRequestHandler = debuggerRequestHandler;

        // Set an event listener to listen for when the panel is disposed (i.e. when the user closes
        // the panel or when the panel is closed programmatically)
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Set the HTML content for the webview panel
        this._panel.webview.html = this._getWebviewContent(
            this._panel.webview,
            extensionUri,
            statsTracker.manualControl(),
            this.getDiagnosticsTabStates(),
        );

        // Handle events from the webview panel
        this._panel.webview.onDidReceiveMessage(message => {
            switch (message.type) {
                case 'restart':
                    this._statsTracker.stop();
                    this._panel.webview.html = this._getWebviewContent(
                        this._panel.webview,
                        extensionUri,
                        statsTracker.manualControl(),
                        this.getDiagnosticsTabStates(),
                    );
                    break;
                case 'pause':
                    this._statsTracker.pause();
                    break;
                case 'resume':
                    this._statsTracker.resume();
                    break;
                case 'slower':
                    this._statsTracker.slower();
                    break;
                case 'faster':
                    this._statsTracker.faster();
                    break;
                case 'speed':
                    this._statsTracker.setSpeed(message.speed);
                    break;
                case 'run-minecraft-command':
                    if (message.command && message.command.trim() !== '') {
                        this._eventEmitter.emit('run-minecraft-command', message.command);
                    }
                    break;
                case 'debugger-request':
                    this._debuggerRequestHandler.handleDebuggerRequest(message.request, message.args);
                    break;
                case 'set-diagnostics-active':
                    this.handleDiagnosticsActiveMessage(message);
                    break;
                case 'sync-diagnostics-tabs':
                    this._eventEmitter.emit('sync-diagnostics-tabs', message.states);
                    break;
                case 'export-data':
                    void this.handleExportDataMessage(message);
                    break;
                default:
                    console.error('Unknown message type:', message.type);
                    break;
            }
        });

        this._statsCallback = {
            onStatUpdated: (stat: StatData) => {
                if (stat.parent_id !== undefined) {
                    const message = {
                        type: 'statistic-updated',
                        should_aggregate: stat.should_aggregate,
                        values: stat.values,
                        children_string_values: stat.children_string_values,
                        id: stat.id,
                        name: stat.name,
                        group_name: stat.parent_name,
                        group: stat.parent_id,
                        full_id: stat.full_id,
                        time: stat.tick,
                        group_full_id: stat.parent_full_id,
                    };
                    this._panel.webview.postMessage(message);
                }
            },
            onSpeedUpdated: (speed: number) => {
                const message = {
                    type: 'speed-updated',
                    speed: speed,
                };
                this._panel.webview.postMessage(message);
            },
            onPauseUpdated: (paused: boolean) => {
                const message = {
                    type: 'pause-updated',
                    paused: paused,
                };
                this._panel.webview.postMessage(message);
            },
            onNotification: (message: string) => {
                window.showInformationMessage(message);
            },
            onSchemaReceived: (schema: DiagnosticsTabDescriptor[]) => {
                const message = {
                    type: 'diagnostics-schema',
                    schema: schema,
                };
                this._panel.webview.postMessage(message);
            },
        };

        this._statsTracker.addStatListener(this._statsCallback);
    }

    private getDiagnosticsTabStates(): DiagnosticsTabStates {
        const states = this._globalState.get<DiagnosticsTabStates>(DIAGNOSTICS_TAB_STATES_KEY, {});
        if (states === null || typeof states !== 'object' || Array.isArray(states)) {
            return {};
        }

        return Object.fromEntries(
            Object.entries(states).filter(([tabName, active]) => tabName.trim() !== '' && typeof active === 'boolean'),
        );
    }

    private handleDiagnosticsActiveMessage(message: any): void {
        if (typeof message.tabName !== 'string' || message.tabName.trim() === '' || typeof message.active !== 'boolean') {
            return;
        }

        const states = this.getDiagnosticsTabStates();
        states[message.tabName] = message.active;
        void this._globalState.update(DIAGNOSTICS_TAB_STATES_KEY, states);
        this._eventEmitter.emit('set-diagnostics-active', message.tabName, message.active);
        this._panel.webview.postMessage({
            type: 'diagnostics-tab-state',
            tabName: message.tabName,
            active: message.active,
        });
    }

    private async handleExportDataMessage(message: any): Promise<void> {
        if (typeof message.content !== 'string') {
            console.error('Received export-data message without a valid content string.');
            return;
        }

        const suggestedFileName =
            typeof message.suggestedFileName === 'string' && message.suggestedFileName.trim() !== ''
                ? message.suggestedFileName
                : 'diagnostics-export.csv';
        const workspaceFolderUri = workspace.workspaceFolders?.[0]?.uri;

        const outputUri = await window.showSaveDialog({
            title: 'Export Diagnostics Data',
            saveLabel: 'Export',
            defaultUri: workspaceFolderUri ? Uri.joinPath(workspaceFolderUri, suggestedFileName) : undefined,
            filters: {
                'CSV Files': ['csv'],
            },
        });

        if (!outputUri) {
            return;
        }

        await workspace.fs.writeFile(outputUri, Buffer.from(message.content, 'utf8'));
        window.showInformationMessage(`Exported diagnostics data to ${outputUri.fsPath}.`);
    }

    public static render(
        extensionUri: Uri,
        statsTracker: StatsProvider,
        eventEmitter: EventEmitter,
        globalState: Memento,
    ): void {
        const statsTrackerId = statsTracker.uniqueId;
        const existingPanel = MinecraftDiagnosticsPanel.activeDiagnosticsPanels.find(
            panel => panel._statsTracker.uniqueId === statsTrackerId,
        );
        if (existingPanel) {
            existingPanel._panel.reveal(ViewColumn.One);
        } else {
            const panel = window.createWebviewPanel(
                statsTrackerId,
                `Minecraft Diagnostics - [${statsTracker.name}]`,
                ViewColumn.Active,
                {
                    retainContextWhenHidden: true,
                    enableScripts: true,
                    localResourceRoots: [
                        Uri.joinPath(extensionUri, 'out'),
                        Uri.joinPath(extensionUri, 'webview-ui/build'),
                    ],
                },
            );
            MinecraftDiagnosticsPanel.activeDiagnosticsPanels.push(
                new MinecraftDiagnosticsPanel(
                    panel,
                    extensionUri,
                    statsTracker,
                    eventEmitter,
                    new DebuggerRequestHandler(panel.webview),
                    globalState,
                ),
            );
        }
    }

    public dispose(): void {
        if (this._statsCallback !== undefined) {
            this._statsTracker.removeStatListener(this._statsCallback);
            this._statsCallback = undefined;
        }

        // Remove the current panel from the active panel list
        MinecraftDiagnosticsPanel.activeDiagnosticsPanels = MinecraftDiagnosticsPanel.activeDiagnosticsPanels.filter(
            panel => panel !== this,
        );

        // Dispose of the current webview panel
        this._panel.dispose();

        // Dispose of all disposables (i.e. commands) for the current webview panel
        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }

    private _getWebviewContent(
        webview: Webview,
        extensionUri: Uri,
        showReplayControls: boolean,
        diagnosticsTabStates: DiagnosticsTabStates,
    ) {
        // The CSS file from the React build output
        const stylesUri = getUri(webview, extensionUri, ['webview-ui', 'build', 'assets', 'diagnosticsPanel.css']);
        // The JS file from the React build output
        const scriptUri = getUri(webview, extensionUri, ['webview-ui', 'build', 'assets', 'diagnosticsPanel.js']);
        const nonce = getNonce();

        // Tip: Install the es6-string-html VS Code extension to enable code highlighting below
        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource}; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
                <link rel="stylesheet" type="text/css" href="${stylesUri}">
                <title>Minecraft Diagnostics</title>
                <script nonce="${nonce}">
                    window.initialParams = ${JSON.stringify({ showReplayControls, diagnosticsTabStates })};
                </script>
            </head>
            <body>
                <div id="root"></div>
                <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
            </body>
            </html>
            `;
    }
}
