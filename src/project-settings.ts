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
    const entries = Array.isArray(json) ? json : (json as { commandShortcuts?: unknown } | null)?.commandShortcuts;
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

export function parseCommandShortcutFiles(json: unknown): string[] {
    const files = (json as { commandShortcutFiles?: unknown } | null)?.commandShortcutFiles;
    return Array.isArray(files) ? files.filter((f): f is string => typeof f === 'string' && f.trim() !== '') : [];
}

// one command per line, blank lines and '#' comments are skipped (mcfunction style)
export function parseCommandText(text: string): CommandShortcut[] {
    return text
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line !== '' && !line.startsWith('#'))
        .map(command => ({ command }));
}

export class ProjectSettingsLoader implements vscode.Disposable {
    private _settings: ProjectSettings = { commandShortcuts: [] };
    private _eventEmitter = new EventEmitter();
    private _disposables: vscode.Disposable[] = [];
    private _watchers: vscode.Disposable[] = [];
    private _patternWatchers: vscode.Disposable[] = [];
    private _generation = 0;

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
        this._generation++;
        this._watchers.forEach(w => w.dispose());
        this._patternWatchers.forEach(w => w.dispose());
        this._disposables.forEach(d => d.dispose());
        this._eventEmitter.removeAllListeners();
    }

    private _watch(folder: vscode.WorkspaceFolder, pattern: string): vscode.Disposable {
        const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, pattern));
        watcher.onDidCreate(() => this._reload());
        watcher.onDidChange(() => this._reload());
        watcher.onDidDelete(() => this._reload());
        return watcher;
    }

    private _watchAndReload() {
        this._watchers.forEach(w => w.dispose());
        this._watchers = (vscode.workspace.workspaceFolders ?? []).map(folder =>
            this._watch(folder, PROJECT_SETTINGS_FILE_NAME)
        );
        this._reload();
    }

    private async _readText(uri: vscode.Uri): Promise<string | undefined> {
        try {
            return Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
        } catch {
            return undefined;
        }
    }

    private _parseFile(fsPath: string, text: string): CommandShortcut[] {
        if (path.extname(fsPath).toLowerCase() !== '.json') {
            return parseCommandText(text);
        }
        try {
            return parseProjectSettings(JSON.parse(text)).commandShortcuts;
        } catch {
            vscode.window.showWarningMessage(`Invalid JSON in ${fsPath}, ignoring it.`);
            return [];
        }
    }

    private async _reload() {
        const generation = ++this._generation;
        const commandShortcuts: CommandShortcut[] = [];
        const patternWatchers: vscode.Disposable[] = [];
        const seen = new Set<string>();
        if (vscode.workspace.isTrusted) {
            for (const folder of vscode.workspace.workspaceFolders ?? []) {
                const mainPath = path.join(folder.uri.fsPath, PROJECT_SETTINGS_FILE_NAME);
                seen.add(mainPath);
                const text = await this._readText(vscode.Uri.file(mainPath));
                if (text === undefined) {
                    continue; // no settings file in this folder
                }
                let json: unknown;
                try {
                    json = JSON.parse(text);
                } catch {
                    vscode.window.showWarningMessage(`Invalid JSON in ${mainPath}, ignoring project settings.`);
                    continue;
                }
                commandShortcuts.push(...parseProjectSettings(json).commandShortcuts);
                for (const pattern of parseCommandShortcutFiles(json)) {
                    patternWatchers.push(this._watch(folder, pattern));
                    const uris = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, pattern));
                    for (const fsPath of uris.map(uri => uri.fsPath).sort()) {
                        if (seen.has(fsPath)) {
                            continue;
                        }
                        seen.add(fsPath);
                        const fileText = await this._readText(vscode.Uri.file(fsPath));
                        if (fileText !== undefined) {
                            commandShortcuts.push(...this._parseFile(fsPath, fileText));
                        }
                    }
                }
            }
        }
        if (generation !== this._generation) {
            patternWatchers.forEach(w => w.dispose());
            return;
        }
        this._patternWatchers.forEach(w => w.dispose());
        this._patternWatchers = patternWatchers;
        this._settings = { commandShortcuts };
        this._eventEmitter.emit('change', this._settings);
    }
}
