// Copyright (C) Microsoft Corporation.  All rights reserved.

import * as vscode from 'vscode';
import { getNonce } from '../utilities/getNonce';
import { getUri } from '../utilities/getUri';
import { EventEmitter } from 'stream';

export class HomeViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'minecraft-debugger-home-panel';

    private readonly _extensionUri: vscode.Uri;
    private _eventEmitter: EventEmitter;
    private _view?: vscode.WebviewView;

    constructor(extensionUri: vscode.Uri, eventEmitter: EventEmitter) {
        this._extensionUri = extensionUri;
        this._eventEmitter = eventEmitter;
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        this._view.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri],
        };

        this._view.webview.html = this._getHtmlForWebview(this._view.webview, this._extensionUri);

        this._view.webview.onDidReceiveMessage(data => {
            switch (data.type) {
                case 'show-diagnostics': {
                    vscode.commands.executeCommand('minecraft-debugger.showMinecraftDiagnostics');
                    break;
                }
                case 'run-minecraft-command': {
                    this._eventEmitter.emit('run-minecraft-command', data.command);
                    break;
                }
            }
        });
    }

    private _getHtmlForWebview(webview: vscode.Webview, extensionUri: vscode.Uri) {
        const stylesUri = getUri(webview, extensionUri, ['webview-ui', 'build', 'assets', 'homePanel.css']);

        // The JS file from the React build output
        const scriptUri = getUri(webview, extensionUri, ['webview-ui', 'build', 'assets', 'homePanel.js']);

        // Use a nonce to only allow a specific script to be run.
        const nonce = getNonce();

        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8" />
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
                <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                <link rel="stylesheet" type="text/css" href="${stylesUri}">
                <title>Minecraft Home</title>
            </head>
            <body>
                <div id="root"></div>
                <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
            </body>
            </html>`;
    }
}
