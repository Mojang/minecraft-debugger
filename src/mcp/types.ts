// Copyright (C) Microsoft Corporation.  All rights reserved.

// Shared contract between the MCP server/tools (vscode-free) and the debugger bridge.

export type LogLevel = 'info' | 'warn' | 'error';

export type DebugEventKind = 'log' | 'stopped' | 'continued' | 'session';

export interface DebugEvent {
    seq: number;
    time: number;
    kind: DebugEventKind;
    level?: LogLevel;
    text: string;
}

export interface DebuggerStatus {
    sessionActive: boolean;
    connected: boolean;
    supportsCommands: boolean;
    paused: boolean;
}

export interface StatSnapshot {
    id: string;
    name: string;
    value: number | string | undefined;
    tick: number;
    ageMs: number;
}

export interface BreakpointResult {
    file: string;
    line: number;
    verified: boolean;
    message?: string;
}

export type StepKind = 'over' | 'in' | 'out';

// Implemented by MinecraftDebuggerBridge. Methods that touch the game throw an Error with a
// human-readable message when they cannot run (no session, not connected, not paused, timeout).
export interface DebuggerBridge {
    getStatus(): DebuggerStatus;
    getEvents(sinceSeq: number, limit: number, level?: LogLevel): { events: DebugEvent[]; nextSeq: number };
    getStats(filter?: string): StatSnapshot[];
    waitForEvent(
        match: (event: DebugEvent) => boolean,
        timeoutMs: number,
        sinceSeq?: number,
    ): Promise<DebugEvent | undefined>;
    getStack(threadId?: number): Promise<unknown>;
    getVariables(frameId: number): Promise<unknown>;
    evaluate(expression: string, frameId?: number): Promise<unknown>;
    runCommand(command: string): void;
    continue(): Promise<void>;
    pause(): Promise<void>;
    step(kind: StepKind): Promise<void>;
    setBreakpoint(file: string, line: number, condition?: string): Promise<BreakpointResult>;
    clearBreakpoints(all: boolean): number;
}

export interface ActivityEntry {
    id: number;
    time: number;
    tool: string;
    args: string;
    status: 'running' | 'ok' | 'error';
    durationMs?: number;
    summary?: string;
}

export interface McpServerState {
    state: 'off' | 'listening' | 'error';
    port?: number;
    clientActive: boolean;
    message?: string;
}

export interface ActivitySink {
    onActivity(entry: ActivityEntry): void;
    onServerState(state: McpServerState): void;
}

export type McpWebviewMessage =
    | { type: 'mcp-replay'; entries: ActivityEntry[]; state: McpServerState }
    | { type: 'mcp-activity'; entry: ActivityEntry }
    | { type: 'mcp-state'; state: McpServerState };
