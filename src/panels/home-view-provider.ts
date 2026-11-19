// Copyright (C) Microsoft Corporation.  All rights reserved.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getNonce } from '../utilities/getNonce';
import { getUri } from '../utilities/getUri';
import { EventEmitter } from 'stream';
import { MinecraftCapabilities } from '../session';

export class HomeViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
    public static readonly viewType = 'minecraft-debugger-home-panel';

    private readonly _extensionUri: vscode.Uri;
    private _eventEmitter: EventEmitter;
    private _view?: vscode.WebviewView;
    private _disposables: vscode.Disposable[] = [];
    private _capturesBasePath = '';
    private _capturesWatcher?: vscode.FileSystemWatcher;
    private _capturesRefreshTimer?: ReturnType<typeof setTimeout>;
    private _capturesRefreshId = 0;
    private _newCaptureFileName?: string;

    constructor(extensionUri: vscode.Uri, eventEmitter: EventEmitter) {
        this._extensionUri = extensionUri;
        this._eventEmitter = eventEmitter;
    }

    public setDebuggerStatus(
        isConnected: boolean,
        minecraftCapabilities: MinecraftCapabilities,
        isListening: boolean,
    ): void {
        this._view?.webview.postMessage({
            type: 'debugger-status',
            isConnected: isConnected,
            isListening: isListening,
            supportsCommands: minecraftCapabilities.supportsCommands,
            supportsProfiler: minecraftCapabilities.supportsProfiler,
        });
    }

    private _requestDebuggerStatus() {
        this._eventEmitter.emit('request-debugger-status');
    }

    public resolveWebviewView(webviewView: vscode.WebviewView): void {
        this.dispose();
        this._view = webviewView;

        this._view.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri],
        };

        this._view.webview.html = this._getHtmlForWebview(this._view.webview, this._extensionUri);

        // listen for events from the debugger Session
        const onNewProfilerCapture = (captureBasePath: string, newCaptureFileName: string) => {
            if (captureBasePath === this._capturesBasePath) {
                this._refreshProfilerCaptures(newCaptureFileName);
            }
        };
        this._eventEmitter.on('new-profiler-capture', onNewProfilerCapture);
        this._disposables.push(new vscode.Disposable(() => {
            this._eventEmitter.off('new-profiler-capture', onNewProfilerCapture);
        }));

        this._view.onDidChangeVisibility(() => this._updateCapturesWatcher(), null, this._disposables);
        this._view.onDidDispose(() => this.dispose(), null, this._disposables);

        // listen for events from the home panel webview
        this._view.webview.onDidReceiveMessage(async message => {
            switch (message.type) {
                case 'show-diagnostics': {
                    vscode.commands.executeCommand('minecraft-debugger.liveDiagnostics');
                    break;
                }
                case 'open-diagnostics-replay': {
                    vscode.commands.executeCommand('minecraft-debugger.replayDiagnostics');
                    break;
                }
                case 'show-settings': {
                    vscode.commands.executeCommand(
                        'workbench.action.openSettings',
                        '@ext:mojang-studios.minecraft-debugger'
                    );
                    break;
                }
                case 'run-minecraft-command': {
                    if (!message.command || message.command.trim() === '') {
                        vscode.window.showErrorMessage('Minecraft Command Shortcut cannot be empty.');
                        return;
                    }
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
                    if (this._capturesBasePath !== message.capturesBasePath) {
                        this._newCaptureFileName = undefined;
                    }
                    this._capturesBasePath = message.capturesBasePath;
                    this._updateCapturesWatcher();
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
                case 'open-captures-folder': {
                    await this._openCapturesFolder(message.capturesBasePath);
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
        }, null, this._disposables);
    }

    public dispose(): void {
        this._stopCapturesWatcher();
        for (const disposable of this._disposables) {
            disposable.dispose();
        }
        this._disposables = [];
        this._view = undefined;
        this._capturesBasePath = '';
        this._newCaptureFileName = undefined;
    }

    private async _browseCapturesBasePath() {
        const uri = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
        });
        if (uri && uri[0]) {
            this._view?.webview.postMessage({ type: 'captures-base-path-set', capturesBasePath: uri[0].fsPath });
        }
    }

    private async _openCapturesFolder(capturesBasePath: string): Promise<void> {
        if (typeof capturesBasePath !== 'string' || capturesBasePath.trim() === '') {
            vscode.window.showErrorMessage('Set a captures path before opening the folder.');
            return;
        }

        try {
            const stats = await fs.promises.stat(capturesBasePath);
            if (!stats.isDirectory()) {
                throw new Error('The captures path is not a folder.');
            }
            if (!await vscode.env.openExternal(vscode.Uri.file(capturesBasePath))) {
                throw new Error('The system file explorer could not be opened.');
            }
        } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Unable to open the captures folder: ${detail}`);
        }
    }

    private _openCaptureFile(capturesBasePath: string, fileName: string) {
        const fullPath = path.join(capturesBasePath, fileName);
        const uri = vscode.Uri.file(fullPath);
        vscode.commands.executeCommand('vscode.open', uri);
    }

    private _updateCapturesWatcher(): void {
        this._stopCapturesWatcher();
        if (!this._view?.visible || !this._capturesBasePath) {
            return;
        }

        this._capturesWatcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(this._capturesBasePath, '*.cpuprofile'),
            false,
            true,
            false,
        );
        const refreshCaptures = () => {
            if (this._capturesRefreshTimer !== undefined) {
                clearTimeout(this._capturesRefreshTimer);
            }
            this._capturesRefreshTimer = setTimeout(() => {
                this._capturesRefreshTimer = undefined;
                this._refreshProfilerCaptures();
            }, 100);
        };
        this._capturesWatcher.onDidCreate(refreshCaptures);
        this._capturesWatcher.onDidDelete(refreshCaptures);
        this._refreshProfilerCaptures();
    }

    private _stopCapturesWatcher(): void {
        this._capturesWatcher?.dispose();
        this._capturesWatcher = undefined;
        if (this._capturesRefreshTimer !== undefined) {
            clearTimeout(this._capturesRefreshTimer);
            this._capturesRefreshTimer = undefined;
        }
        ++this._capturesRefreshId;
    }

    private _refreshProfilerCaptures(newCaptureFileName?: string) {
        if (newCaptureFileName) {
            this._newCaptureFileName = newCaptureFileName;
        }
        const view = this._view;
        if (!view?.visible || !this._capturesBasePath) {
            return;
        }
        const refreshId = ++this._capturesRefreshId;
        fs.readdir(this._capturesBasePath, (err, files) => {
            if (refreshId !== this._capturesRefreshId) {
                return;
            }
            if (err) {
                console.error('Error reading captures directory:', err);
                view.webview.postMessage({ type: 'capture-files-refresh-failed' });
                return;
            }
            const allCaptureFileNames = files.filter(file => path.extname(file) === '.cpuprofile');
            view.webview.postMessage({
                type: 'capture-files-refreshed',
                allCaptureFileNames: allCaptureFileNames,
                newCaptureFileName: this._newCaptureFileName,
            });
            this._newCaptureFileName = undefined;
        });
    }

    private _deleteProfilerCapture(capturesBasePath: string, fileName: string) {
        const fullPath = path.join(capturesBasePath, fileName);
        fs.unlink(fullPath, err => {
            if (err) {
                console.error('Error deleting capture file:', err);
                return;
            }
            if (capturesBasePath === this._capturesBasePath) {
                this._refreshProfilerCaptures();
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
