
// Copyright (C) Microsoft Corporation.  All rights reserved.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getNonce } from '../utilities/getNonce';
import { getUri } from '../utilities/getUri';
import { EventEmitter } from 'stream';
import { MinecraftCapabilities } from '../Session';

export class HomeViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'minecraft-debugger-home-panel';

    private readonly _extensionUri: vscode.Uri;
    private _eventEmitter: EventEmitter;
    private _view?: vscode.WebviewView;

    constructor(extensionUri: vscode.Uri, eventEmitter: EventEmitter) {
        this._extensionUri = extensionUri;
        this._eventEmitter = eventEmitter;
    }

    public setDebuggerStatus(isConnected: boolean, minecraftCapabilities: MinecraftCapabilities) {
        this._view?.webview.postMessage({
            type: 'debugger-status',
            isConnected: isConnected,
            supportsCommands: minecraftCapabilities.supportsCommands,
            supportsProfiler: minecraftCapabilities.supportsProfiler
        });
    }

    private _requestDebuggerStatus() {
        this._eventEmitter.emit('request-debugger-status');
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

        // listen for events from the debugger Session
        this._eventEmitter.on('new-profiler-capture', (captureBasePath: string, newCaptureFileName: string) => {
            this._refreshProfilerCaptures(captureBasePath, newCaptureFileName);
        });

        // listen for events from the home panel webview
        this._view.webview.onDidReceiveMessage(async message => {
            switch (message.type) {
                case 'show-diagnostics': {
                    vscode.commands.executeCommand('minecraft-debugger.showMinecraftDiagnostics');
                    break;
                }
                case 'run-minecraft-command': {
                    this._eventEmitter.emit('run-minecraft-command', message.command);
                    break;
                }
                case 'start-profiler': {
                    this._eventEmitter.emit('start-profiler');
                    break;
                }
                case 'stop-profiler': {
                    this._eventEmitter.emit('stop-profiler', message.capturesBasePath);
                    break;
                }
                case 'refresh-captures': {
                    this._refreshProfilerCaptures(message.capturesBasePath);
                    break;
                }
                case 'request-debugger-status': {
                    this._requestDebuggerStatus();
                    break;
                }
                case 'browse-captures-base-path': {
                    await this._browseCapturesBasePath();
                    break;
                }
                case 'open-capture-file': {
                    this._openCaptureFile(message.capturesBasePath, message.fileName);
                    break;
                }
                case 'delete-capture-file': {
                    this._deleteProfilerCapture(message.capturesBasePath, message.fileName);
                    break;
                }
            }
        });
    }

    private async _browseCapturesBasePath() {
        const uri = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false
        });
        if (uri && uri[0]) {
            this._view?.webview.postMessage({ type: 'captures-base-path-set', capturesBasePath: uri[0].fsPath });
        }
    }

    private _openCaptureFile(capturesBasePath: string, fileName: string) {
        const fullPath = path.join(capturesBasePath, fileName);
        const uri = vscode.Uri.file(fullPath);
        vscode.commands.executeCommand('vscode.open', uri);
    }

    private _refreshProfilerCaptures(capturesBasePath: string, newCaptureFileName?: string) {
        fs.readdir(capturesBasePath, (err, files) => {
            if (err) {
                console.error('Error reading captures directory:', err);
                return;
            }
            const allCaptureFileNames = files.filter(file => path.extname(file) === '.cpuprofile');
            this._view?.webview.postMessage({
                type: 'capture-files-refreshed',
                allCaptureFileNames: allCaptureFileNames,
                newCaptureFileName: newCaptureFileName
            });
        });
    }

    private _deleteProfilerCapture(capturesBasePath: string, fileName: string) {
        const fullPath = path.join(capturesBasePath, fileName);
        fs.unlink(fullPath, (err) => {
            if (err) {
                console.error('Error deleting capture file:', err);
                return;
            }
            this._refreshProfilerCaptures(capturesBasePath);
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
