// Copyright (C) Microsoft Corporation.  All rights reserved.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'stream';

import { MinecraftCapabilities } from '../session';
import { StatsListener, StatsProvider } from '../stats/stats-provider';
import { EventBuffer } from './event-buffer';
import {
    BreakpointResult,
    DebugEvent,
    DebuggerBridge,
    DebuggerStatus,
    DiagnosticsTab,
    LogLevel,
    StatSnapshot,
    StepKind,
} from './types';

const DAP_TIMEOUT_MS = 10000;
const STEP_COMMANDS: Record<StepKind, string> = {
    over: 'workbench.action.debug.stepOver',
    in: 'workbench.action.debug.stepInto',
    out: 'workbench.action.debug.stepOut',
};

async function waitUntil(condition: () => boolean, timeoutMs: number): Promise<void> {
    for (let waited = 0; !condition() && waited < timeoutMs; waited += 100) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }
}

interface StoredStat {
    name: string;
    group: string;
    value: number | string | undefined;
    rows: string[][];
    tick: number;
    receivedAt: number;
}

// Implements the MCP tool surface on top of the active 'minecraft-js' debug session.
export class MinecraftDebuggerBridge implements DebuggerBridge, vscode.Disposable {
    private readonly _events = new EventBuffer(1000);
    private readonly _disposables: vscode.Disposable[] = [];
    private readonly _stats = new Map<string, StoredStat>();
    private readonly _statListener: StatsListener;
    private readonly _onDebuggerStatus: (isConnected: boolean, caps: MinecraftCapabilities) => void;
    private _session?: vscode.DebugSession;
    private _paused = false;
    private _stoppedThreadId: number | undefined;
    private _connected = false;
    private _supportsCommands = false;
    private _ownBreakpoints: vscode.Breakpoint[] = [];
    private _tabs: DiagnosticsTab[] | undefined;
    private readonly _onDiagnosticsTabs: (tabs?: DiagnosticsTab[]) => void;

    constructor(
        private readonly _eventEmitter: EventEmitter,
        private readonly _statsProvider: StatsProvider,
    ) {
        const active = vscode.debug.activeDebugSession;
        if (active?.type === 'minecraft-js') {
            this._session = active;
        }

        this._disposables.push(
            vscode.debug.onDidStartDebugSession(session => {
                if (session.type !== 'minecraft-js') {
                    return;
                }
                this._session = session;
                this._paused = false;
                this._events.push({ kind: 'session', text: 'Debug session started' });
            }),
            vscode.debug.onDidTerminateDebugSession(session => {
                if (session.type !== 'minecraft-js') {
                    return;
                }
                if (this._session?.id === session.id) {
                    this._session = undefined;
                }
                this._paused = false;
                this._connected = false;
                this._events.push({ kind: 'session', text: 'Debug session ended' });
            }),
            vscode.debug.registerDebugAdapterTrackerFactory('minecraft-js', {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                createDebugAdapterTracker: () => ({ onDidSendMessage: (m: any) => this._onDapMessage(m) }),
            }),
        );

        this._onDebuggerStatus = (isConnected, caps) => {
            this._connected = isConnected;
            this._supportsCommands = !!caps?.supportsCommands;
        };
        this._eventEmitter.on('debugger-status', this._onDebuggerStatus);
        this._eventEmitter.emit('request-debugger-status');

        this._statListener = {
            onStatUpdated: stat => {
                this._stats.set(stat.full_id, {
                    name: stat.name,
                    group: stat.parent_name,
                    value: stat.values[stat.values.length - 1],
                    rows: stat.children_string_values,
                    tick: stat.tick,
                    receivedAt: Date.now(),
                });
            },
        };
        this._statsProvider.addStatListener(this._statListener);

        // reported by the Live Diagnostics panel while it is open
        this._onDiagnosticsTabs = tabs => {
            this._tabs = tabs;
        };
        this._eventEmitter.on('diagnostics-tabs', this._onDiagnosticsTabs);
    }

    public dispose(): void {
        this._eventEmitter.off('debugger-status', this._onDebuggerStatus);
        this._eventEmitter.off('diagnostics-tabs', this._onDiagnosticsTabs);
        this._statsProvider.removeStatListener(this._statListener);
        this._disposables.forEach(d => d.dispose());
        this._disposables.length = 0;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private _onDapMessage(m: any): void {
        if (m.type === 'event' && m.event === 'output') {
            const category = m.body?.category;
            const level: LogLevel = category === 'stderr' ? 'error' : category === 'console' ? 'warn' : 'info';
            this._events.push({ kind: 'log', level, text: String(m.body?.output ?? '').trimEnd() });
        } else if (m.type === 'event' && m.event === 'stopped') {
            this._paused = true;
            this._stoppedThreadId = m.body?.threadId;
            const reason = m.body?.reason ?? 'stopped';
            const description = m.body?.description;
            this._events.push({ kind: 'stopped', text: reason + (description ? ': ' + description : '') });
        } else if (
            (m.type === 'event' && m.event === 'continued') ||
            (m.type === 'response' && m.success && ['continue', 'next', 'stepIn', 'stepOut'].includes(m.command))
        ) {
            this._paused = false;
            this._events.push({ kind: 'continued', text: 'Execution resumed' });
        }
    }

    private _requireSession(): vscode.DebugSession {
        if (!this._session) {
            throw new Error('No active Minecraft Debugger session');
        }
        return this._session;
    }

    // workbench debug commands act on the focused session, so refuse when that is not ours
    private _requireFocusedSession(): void {
        const session = this._requireSession();
        if (vscode.debug.activeDebugSession?.id !== session.id) {
            throw new Error('Minecraft Debugger session is not the active debug session');
        }
    }

    private _requirePaused(): vscode.DebugSession {
        const session = this._requireSession();
        if (!this._paused) {
            throw new Error('Debugger is not paused');
        }
        return session;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private async _dap(cmd: string, args?: any): Promise<any> {
        const session = this._requireSession();
        let timer: NodeJS.Timeout | undefined;
        const timeout = new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error(`Debugger request '${cmd}' timed out`)), DAP_TIMEOUT_MS);
        });
        try {
            return await Promise.race([session.customRequest(cmd, args), timeout]);
        } finally {
            clearTimeout(timer);
        }
    }

    public getStatus(): DebuggerStatus {
        return {
            sessionActive: !!this._session,
            connected: this._connected,
            supportsCommands: this._supportsCommands,
            paused: this._paused,
        };
    }

    public getEvents(sinceSeq: number, limit: number, level?: LogLevel): { events: DebugEvent[]; nextSeq: number } {
        return this._events.since(sinceSeq, limit, level);
    }

    public waitForEvent(
        match: (event: DebugEvent) => boolean,
        timeoutMs: number,
        sinceSeq?: number,
    ): Promise<DebugEvent | undefined> {
        return this._events.waitFor(match, timeoutMs, sinceSeq);
    }

    public getStats(filter?: string): StatSnapshot[] {
        const needle = filter?.toLowerCase();
        const now = Date.now();
        const result: StatSnapshot[] = [];
        for (const [id, s] of this._stats) {
            if (needle && ![id, s.name, s.group].some(text => text.toLowerCase().includes(needle))) {
                continue;
            }
            result.push({
                id,
                name: s.name,
                group: s.group,
                value: s.value,
                ...(s.rows.length > 0 && { rows: s.rows }),
                tick: s.tick,
                ageMs: now - s.receivedAt,
            });
        }
        return result;
    }

    public async getStack(threadId?: number): Promise<unknown> {
        this._requirePaused();
        const id = threadId ?? this._stoppedThreadId ?? (await this._dap('threads')).threads?.[0]?.id;
        if (id === undefined) {
            throw new Error('No threads available');
        }
        const response = await this._dap('stackTrace', { threadId: id, startFrame: 0, levels: 50 });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (response.stackFrames ?? []).map((f: any) => ({
            id: f.id,
            name: f.name,
            source: f.source?.path,
            line: f.line,
            column: f.column,
        }));
    }

    public async getVariables(frameId: number): Promise<unknown> {
        this._requirePaused();
        const { scopes } = await this._dap('scopes', { frameId });
        const result = [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const scope of (scopes ?? []) as any[]) {
            const { variables } = await this._dap('variables', { variablesReference: scope.variablesReference });
            result.push({
                scope: scope.name,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                variables: (variables ?? []).map((v: any) => ({
                    name: v.name,
                    value: v.value,
                    type: v.type,
                    variablesReference: v.variablesReference,
                })),
            });
        }
        return result;
    }

    public async evaluate(expression: string, frameId?: number): Promise<unknown> {
        const { result, type } = await this._dap('evaluate', { expression, frameId, context: 'repl' });
        return { result, type };
    }

    // Evaluates in the running game. Minecraft sometimes answers an evaluate with an empty result without
    // running it, so expressions return 'R:'-prefixed strings and are resent until one comes back.
    private async _evaluateMarked(expression: string): Promise<string> {
        for (let attempt = 0; attempt < 20; attempt++) {
            const { result } = await this._dap('evaluate', { expression, context: 'repl' });
            if (typeof result === 'string' && result.startsWith('R:')) {
                return result.slice(2);
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        throw new Error('Minecraft did not evaluate the request');
    }

    // Loads @minecraft/server once through a dynamic import (it resolves on the next game tick),
    // then queries entities without breakpoints or profilers.
    public async getEntities(dimension: string, type?: string, limit = 200): Promise<unknown> {
        if (!this._connected) {
            throw new Error('Minecraft is not connected');
        }
        if (this._paused) {
            throw new Error('Resume the game first: the scripting API loads on a game tick');
        }
        const load =
            "globalThis.__mcpServerModule ? 'R:ready' : (import('@minecraft/server').then(m => { globalThis.__mcpServerModule = m; }), 'R:loading')";
        let state = await this._evaluateMarked(load);
        for (let waited = 0; state !== 'ready' && waited < 3000; waited += 100) {
            await new Promise(resolve => setTimeout(resolve, 100));
            state = await this._evaluateMarked(load);
        }
        if (state !== 'ready') {
            throw new Error('Could not load @minecraft/server in the game');
        }
        const query = `(() => {
            const all = globalThis.__mcpServerModule.world.getDimension(${JSON.stringify(dimension)})
                .getEntities(${JSON.stringify(type ? { type } : {})});
            const entities = all.slice(0, ${limit}).map(e => ({
                id: e.id, type: e.typeId, name: e.nameTag || undefined, location: e.location, dimension: e.dimension.id,
            }));
            return 'R:' + JSON.stringify({ total: all.length, entities });
        })()`;
        return JSON.parse(await this._evaluateMarked(query));
    }

    // Same channel the Live Diagnostics tabs use for their buttons (profilers, filters, CSV exports).
    public debuggerRequest(request: string, args?: Record<string, unknown>): Promise<unknown> {
        return this._dap('debugger-request', { request, args });
    }

    // Opens or reveals the Live Diagnostics panel; the tab list comes from it.
    public async getDiagnosticsTabs(): Promise<DiagnosticsTab[]> {
        await vscode.commands.executeCommand('minecraft-debugger.liveDiagnostics');
        await waitUntil(() => this._tabs !== undefined, 5000);
        if (!this._tabs) {
            throw new Error('The Live Diagnostics panel did not report its tabs');
        }
        return this._tabs;
    }

    // Toggles a tab exactly like its switch in the panel, which enables or disables its collectors.
    public async setDiagnosticsTab(tab: string, active: boolean): Promise<DiagnosticsTab> {
        const tabs = await this.getDiagnosticsTabs();
        if (!tabs.some(t => t.name === tab)) {
            throw new Error(`Unknown tab '${tab}'. Tabs: ${tabs.map(t => t.name).join(', ')}`);
        }
        this._eventEmitter.emit('set-diagnostics-tab', tab, active);
        await waitUntil(() => this._tabs?.find(t => t.name === tab)?.active === active, 3000);
        return this._tabs?.find(t => t.name === tab) ?? { name: tab, active: !active };
    }

    public runCommand(command: string): void {
        this._requireSession();
        if (!this._connected || !this._supportsCommands) {
            throw new Error('Minecraft is not connected or does not support commands');
        }
        this._eventEmitter.emit('run-minecraft-command', command);
    }

    public async continue(): Promise<void> {
        this._requireFocusedSession();
        await vscode.commands.executeCommand('workbench.action.debug.continue');
    }

    // workbench.action.debug.pause is a no-op when invoked without a thread context, so ask the adapter directly.
    // Only the first thread, like the toolbar: a pause sent to every thread stays armed and stops them later.
    public async pause(): Promise<void> {
        const threadId = (await this._dap('threads')).threads?.[0]?.id;
        if (threadId === undefined) {
            // the adapter learns thread ids only from the game's thread/stopped events
            throw new Error('Minecraft has not reported a script thread yet; hit a breakpoint once, then pause works');
        }
        await this._dap('pause', { threadId });
    }

    public async step(kind: StepKind): Promise<void> {
        this._requireFocusedSession();
        await vscode.commands.executeCommand(STEP_COMMANDS[kind]);
    }

    public async setBreakpoint(file: string, line: number, condition?: string): Promise<BreakpointResult> {
        // relative paths resolve against the session's localRoot (where the sources live), else the workspace root
        const base: string =
            this._session?.configuration.localRoot ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
        const abs = path.resolve(base, file);
        if (!fs.existsSync(abs)) {
            // refuse instead of leaving a phantom breakpoint that errors on every debug start
            throw new Error(`File not found: ${abs}`);
        }
        const bp = new vscode.SourceBreakpoint(
            new vscode.Location(vscode.Uri.file(abs), new vscode.Position(line - 1, 0)),
            true,
            condition,
        );
        vscode.debug.addBreakpoints([bp]);
        this._ownBreakpoints.push(bp);

        const session = this._session;
        if (!session) {
            return { file: abs, line, verified: false, message: 'No active session; sent when debugging starts' };
        }
        // VS Code sends setBreakpoints asynchronously; poll briefly for the adapter's answer
        for (let i = 0; i < 20; i++) {
            const dapBp = await session.getDebugProtocolBreakpoint(bp);
            if (dapBp) {
                const {
                    verified,
                    message,
                    line: boundLine,
                } = dapBp as { verified: boolean; message?: string; line?: number };
                return { file: abs, line: boundLine ?? line, verified, message };
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        return { file: abs, line, verified: false, message: 'No response from the debug adapter' };
    }

    public clearBreakpoints(all: boolean): number {
        const toRemove = all ? [...vscode.debug.breakpoints] : this._ownBreakpoints;
        vscode.debug.removeBreakpoints(toRemove);
        this._ownBreakpoints = [];
        return toRemove.length;
    }
}
