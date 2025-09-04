// Copyright (C) Microsoft Corporation.  All rights reserved.

import { Disposable, Webview, WebviewPanel, window, Uri, ViewColumn } from 'vscode';
import { getUri } from '../utilities/getUri';
import { getNonce } from '../utilities/getNonce';
import { StatData, StatsListener, StatsProvider } from '../stats/stats-provider';

export class MinecraftDiagnosticsPanel {
    private static activeDiagnosticsPanels: MinecraftDiagnosticsPanel[] = [];

    private readonly _panel: WebviewPanel;
    private _disposables: Disposable[] = [];
    private _statsTracker: StatsProvider;
    private _statsCallback: StatsListener | undefined = undefined;

    private constructor(panel: WebviewPanel, extensionUri: Uri, statsTracker: StatsProvider) {
        this._panel = panel;
        this._statsTracker = statsTracker;

        // Set an event listener to listen for when the panel is disposed (i.e. when the user closes
        // the panel or when the panel is closed programmatically)
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Set the HTML content for the webview panel
        this._panel.webview.html = this._getWebviewContent(
            this._panel.webview,
            extensionUri,
            statsTracker.manualControl()
        );

        // Handle events from the webview panel
        this._panel.webview.onDidReceiveMessage(message => {
            switch (message.type) {
                case 'restart':
                    this._statsTracker.stop();
                    this._panel.webview.html = this._getWebviewContent(
                        this._panel.webview,
                        extensionUri,
                        statsTracker.manualControl()
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
                        is_modular: stat.is_modular,
                        values: stat.values,
                        string_values: stat.string_values,
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
        };

        this._statsTracker.addStatListener(this._statsCallback);
    }

    public static render(extensionUri: Uri, statsTracker: StatsProvider): void {
        const statsTrackerId = statsTracker.uniqueId;
        const existingPanel = MinecraftDiagnosticsPanel.activeDiagnosticsPanels.find(
            panel => panel._statsTracker.uniqueId === statsTrackerId
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
                }
            );
            MinecraftDiagnosticsPanel.activeDiagnosticsPanels.push(
                new MinecraftDiagnosticsPanel(panel, extensionUri, statsTracker)
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
            panel => panel !== this
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

    private _getWebviewContent(webview: Webview, extensionUri: Uri, showReplayControls: boolean) {
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
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
                <link rel="stylesheet" type="text/css" href="${stylesUri}">
                <title>Minecraft Diagnostics</title>
                <script nonce="${nonce}">
                    window.initialParams = { showReplayControls: ${showReplayControls} };
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
