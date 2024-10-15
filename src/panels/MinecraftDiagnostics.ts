
// Copyright (C) Microsoft Corporation.  All rights reserved.

import { Disposable, Webview, WebviewPanel, window, Uri, ViewColumn } from 'vscode';
import { getUri } from '../utilities/getUri';
import { getNonce } from '../utilities/getNonce';
import { StatData, StatsListener, StatsProvider2 } from '../StatsProvider2';

export class MinecraftDiagnosticsPanel {
    public static currentPanel: MinecraftDiagnosticsPanel | undefined;
    private readonly _panel: WebviewPanel;
    private _disposables: Disposable[] = [];

    private _statsTracker: StatsProvider2;
    private _statsCallback: StatsListener | undefined = undefined;

    private constructor(panel: WebviewPanel, extensionUri: Uri, statsTracker: StatsProvider2) {
        this._panel = panel;
        this._statsTracker = statsTracker;

        // Set an event listener to listen for when the panel is disposed (i.e. when the user closes
        // the panel or when the panel is closed programmatically)
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Set the HTML content for the webview panel
        this._panel.webview.html = this._getWebviewContent(this._panel.webview, extensionUri);

        // Set an event listener to listen for messages passed from the webview context
        //this._setWebviewMessageListener(this._panel.webview);

        this._statsCallback = (stat: StatData) => {
            if (stat.parent_id !== undefined) {
                const message = {
                    type: 'statistic-updated',
                    values: stat.values,
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
        };

        this._statsTracker.addStatListener(this._statsCallback);
    }

    /**
     * Renders the current webview panel if it exists otherwise a new webview panel
     * will be created and displayed.
     *
     * @param extensionUri The URI of the directory containing the extension.
     */
    public static render(extensionUri: Uri, statsTracker: StatsProvider2) {
        if (MinecraftDiagnosticsPanel.currentPanel) {
            // If the webview panel already exists reveal it
            MinecraftDiagnosticsPanel.currentPanel._panel.reveal(ViewColumn.One);
        } else {
            // If a webview panel does not already exist create and show a new one
            const panel = window.createWebviewPanel(
                // Panel view type
                'showMinecraftDiagnostics',
                // Panel title
                'Minecraft Diagnostic',
                // The editor column the panel should be displayed in
                ViewColumn.One,
                // Extra panel configurations
                {
                    // Enable JavaScript in the webview
                    enableScripts: true,
                    // Restrict the webview to only load resources from the `out` and `webview-ui/build` directories
                    localResourceRoots: [
                        Uri.joinPath(extensionUri, 'out'),
                        Uri.joinPath(extensionUri, 'webview-ui/build'),
                    ],
                }
            );

            MinecraftDiagnosticsPanel.currentPanel = new MinecraftDiagnosticsPanel(panel, extensionUri, statsTracker);
        }
    }

    /**
     * Cleans up and disposes of webview resources when the webview panel is closed.
     */
    public dispose() {
        if (this._statsCallback !== undefined) {
            this._statsTracker.removeStatListener(this._statsCallback);
            this._statsCallback = undefined;
        }

        MinecraftDiagnosticsPanel.currentPanel = undefined;

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

    /**
     * Defines and returns the HTML that should be rendered within the webview panel.
     *
     * @remarks This is also the place where references to the React webview build files
     * are created and inserted into the webview HTML.
     *
     * @param webview A reference to the extension webview
     * @param extensionUri The URI of the directory containing the extension
     * @returns A template string literal containing the HTML that should be
     * rendered within the webview panel
     */
    private _getWebviewContent(webview: Webview, extensionUri: Uri) {
        // The CSS file from the React build output
        const stylesUri = getUri(webview, extensionUri, ['webview-ui', 'build', 'assets', 'diagnosticsPanel.css']);
        // The JS file from the React build output
        const scriptUri = getUri(webview, extensionUri, ['webview-ui', 'build', 'assets', 'diagnosticsPanel.js']);

        const nonce = getNonce();

        // Tip: Install the es6-string-html VS Code extension to enable code highlighting below
        return /*html*/ `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
          <link rel="stylesheet" type="text/css" href="${stylesUri}">
          <title>Minecraft Diagnostics</title>
        </head>
        <body>
          <div id="root"></div>
          <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
        </body>
      </html>
    `;
    }
}
