// Copyright (C) Microsoft Corporation.  All rights reserved.

import * as vscode from 'vscode';
import * as path from 'path';
import { EventEmitter } from 'stream';

export const PROJECT_SETTINGS_FILE_NAME = 'minecraft-debugger.json';

export interface CommandShortcut {
    label?: string;
    command: string;
}

export interface ProjectSettings {
    commandShortcuts: CommandShortcut[];
}

export function parseProjectSettings(json: unknown): ProjectSettings {
    const commandShortcuts: CommandShortcut[] = [];
    const entries = (json as { commandShortcuts?: unknown } | null)?.commandShortcuts;
    if (Array.isArray(entries)) {
        for (const entry of entries) {
            if (typeof entry === 'string' && entry.trim() !== '') {
                commandShortcuts.push({ command: entry });
            } else if (typeof entry === 'object' && entry !== null) {
                const { command, label } = entry as { command?: unknown; label?: unknown };
                if (typeof command === 'string' && command.trim() !== '') {
                    commandShortcuts.push(typeof label === 'string' && label !== '' ? { label, command } : { command });
                }
            }
        }
    }
    return { commandShortcuts };
}

export class ProjectSettingsLoader implements vscode.Disposable {
    private _settings: ProjectSettings = { commandShortcuts: [] };
    private _eventEmitter = new EventEmitter();
    private _disposables: vscode.Disposable[] = [];
    private _watchers: vscode.Disposable[] = [];

    constructor() {
        this._disposables.push(
            vscode.workspace.onDidChangeWorkspaceFolders(() => this._watchAndReload()),
            vscode.workspace.onDidGrantWorkspaceTrust(() => this._reload())
        );
        this._watchAndReload();
    }

    public get settings(): ProjectSettings {
        return this._settings;
    }

    public onDidChange(listener: (settings: ProjectSettings) => void): void {
        this._eventEmitter.on('change', listener);
    }

    public dispose(): void {
        this._watchers.forEach(w => w.dispose());
        this._disposables.forEach(d => d.dispose());
        this._eventEmitter.removeAllListeners();
    }

    private _watchAndReload() {
        this._watchers.forEach(w => w.dispose());
        this._watchers = [];
        for (const folder of vscode.workspace.workspaceFolders ?? []) {
            const watcher = vscode.workspace.createFileSystemWatcher(
                new vscode.RelativePattern(folder, PROJECT_SETTINGS_FILE_NAME)
            );
            watcher.onDidCreate(() => this._reload());
            watcher.onDidChange(() => this._reload());
            watcher.onDidDelete(() => this._reload());
            this._watchers.push(watcher);
        }
        this._reload();
    }

    private async _reload() {
        const commandShortcuts: CommandShortcut[] = [];
        if (vscode.workspace.isTrusted) {
            for (const folder of vscode.workspace.workspaceFolders ?? []) {
                const uri = vscode.Uri.file(path.join(folder.uri.fsPath, PROJECT_SETTINGS_FILE_NAME));
                let text: string;
                try {
                    text = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
                } catch {
                    continue; // no settings file in this folder
                }
                try {
                    commandShortcuts.push(...parseProjectSettings(JSON.parse(text)).commandShortcuts);
                } catch {
                    vscode.window.showWarningMessage(`Invalid JSON in ${uri.fsPath}, ignoring project settings.`);
                }
            }
        }
        this._settings = { commandShortcuts };
        this._eventEmitter.emit('change', this._settings);
    }
}
