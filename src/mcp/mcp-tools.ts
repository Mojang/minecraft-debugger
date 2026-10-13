// Copyright (C) Microsoft Corporation.  All rights reserved.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { ActivityEntry, ActivitySink, DebuggerBridge } from './types';

let nextId = 0;

function truncate(s: string, max: number): string {
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

async function withActivity(
    sink: ActivitySink,
    tool: string,
    args: unknown,
    fn: () => Promise<unknown> | unknown,
): Promise<CallToolResult> {
    const entry: ActivityEntry = {
        id: ++nextId,
        time: Date.now(),
        tool,
        args: truncate(JSON.stringify(args ?? {}), 200),
        status: 'running',
    };
    sink.onActivity({ ...entry });
    const start = Date.now();
    try {
        const result = await fn();
        const text = JSON.stringify(result ?? { ok: true }, null, 2);
        sink.onActivity({ ...entry, status: 'ok', durationMs: Date.now() - start, summary: truncate(text, 200) });
        return { content: [{ type: 'text', text }] };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        sink.onActivity({ ...entry, status: 'error', durationMs: Date.now() - start, summary: message });
        return { content: [{ type: 'text', text: message }], isError: true };
    }
}

export function registerTools(server: McpServer, bridge: DebuggerBridge, sink: ActivitySink): void {
    const run = (tool: string, args: unknown, fn: () => Promise<unknown> | unknown) =>
        withActivity(sink, tool, args, fn);

    server.registerTool(
        'get_status',
        { description: 'Get the debug session state: sessionActive, connected, supportsCommands, paused.' },
        () => run('get_status', {}, () => bridge.getStatus()),
    );

    server.registerTool(
        'get_logs',
        {
            description:
                'Get buffered Minecraft/debugger output events. Pass the returned nextSeq as sinceSeq to read only new events.',
            inputSchema: {
                sinceSeq: z.number().int().min(0).optional(),
                limit: z.number().int().min(1).max(500).optional(),
                level: z.enum(['info', 'warn', 'error']).optional(),
            },
        },
        args => run('get_logs', args, () => bridge.getEvents(args.sinceSeq ?? 0, args.limit ?? 100, args.level)),
    );

    server.registerTool(
        'get_stats',
        {
            description:
                'Get the latest value of live diagnostics stats. Stats arrive for the tabs enabled in the Live Diagnostics panel (see set_diagnostics_tab).',
            inputSchema: { filter: z.string().optional() },
        },
        args => run('get_stats', args, () => bridge.getStats(args.filter)),
    );

    server.registerTool(
        'debugger_request',
        {
            description:
                "Send a named request to Minecraft, the same ones the Live Diagnostics tab buttons send, and return its response. Examples: 'Start Entity System Profiler', 'Stop Entity System Profiler', 'Clear Entity System Profiler', 'Request CSV Entity System Profiler', 'Start CPU Profiler', 'Stop CPU Profiler'. Profiler data then arrives as stats (get_stats).",
            inputSchema: { request: z.string().min(1), args: z.record(z.string(), z.unknown()).optional() },
        },
        args => run('debugger_request', args, () => bridge.debuggerRequest(args.request, args.args)),
    );

    server.registerTool(
        'get_diagnostics_tabs',
        {
            description:
                'List the Live Diagnostics panel tabs and whether each is enabled. Opens the panel if it is closed.',
        },
        () => run('get_diagnostics_tabs', {}, () => bridge.getDiagnosticsTabs()),
    );

    server.registerTool(
        'set_diagnostics_tab',
        {
            description:
                "Enable or disable a Live Diagnostics tab (name from get_diagnostics_tabs), like its switch in the panel, and show it. Enabling a tab turns on its stat collectors for get_stats. Returns the tab's resulting state.",
            inputSchema: { tab: z.string().min(1), active: z.boolean() },
        },
        args => run('set_diagnostics_tab', args, () => bridge.setDiagnosticsTab(args.tab, args.active)),
    );

    server.registerTool(
        'get_stack',
        {
            description: 'Get the call stack of a paused thread (defaults to the first thread).',
            inputSchema: { threadId: z.number().int().optional() },
        },
        args => run('get_stack', args, () => bridge.getStack(args.threadId)),
    );

    server.registerTool(
        'get_variables',
        {
            description:
                'Get scopes and their variables for a stack frame id (from get_stack). Requires a paused debugger.',
            inputSchema: { frameId: z.number().int() },
        },
        args => run('get_variables', args, () => bridge.getVariables(args.frameId)),
    );

    server.registerTool(
        'evaluate',
        {
            description:
                "Evaluate a script expression, in a stack frame (frameId from get_stack) while paused or in the global scope while running. While running, Minecraft sometimes returns an empty result (type 'undefined') without evaluating: resend, and return a marker such as 'R:' + value to tell a real undefined apart.",
            inputSchema: { expression: z.string().min(1), frameId: z.number().int().optional() },
        },
        args => run('evaluate', args, () => bridge.evaluate(args.expression, args.frameId)),
    );

    server.registerTool(
        'get_entities',
        {
            description:
                "List entities in a dimension with id, type, name tag and location, while the game is running. dimension defaults to 'overworld'; type filters by entity type (e.g. 'minecraft:pig'); returns at most limit entities (default 200) plus the total.",
            inputSchema: {
                dimension: z.string().min(1).optional(),
                type: z.string().min(1).optional(),
                limit: z.number().int().min(1).max(5000).optional(),
            },
        },
        args =>
            run('get_entities', args, () => bridge.getEntities(args.dimension ?? 'overworld', args.type, args.limit)),
    );

    server.registerTool(
        'run_command',
        {
            description:
                "Run a Minecraft command (leading '/' optional). Fire-and-forget: use wait_for_event or get_logs to observe its effects. 'reload' reloads scripts.",
            inputSchema: { command: z.string().min(1) },
        },
        args =>
            run('run_command', args, () => {
                bridge.runCommand(args.command.replace(/^\//, ''));
                return { sent: true };
            }),
    );

    server.registerTool('continue', { description: 'Resume execution of the paused debugger.' }, () =>
        run('continue', {}, () => bridge.continue()),
    );

    server.registerTool('pause', { description: 'Pause execution.' }, () => run('pause', {}, () => bridge.pause()));

    server.registerTool(
        'step',
        {
            description: 'Step over, in, or out while paused.',
            inputSchema: { kind: z.enum(['over', 'in', 'out']) },
        },
        args => run('step', args, () => bridge.step(args.kind)),
    );

    server.registerTool(
        'set_breakpoint',
        {
            description:
                "Set a breakpoint. file is absolute or relative to the debug session's localRoot (workspace root when no session); line is 1-based. Returns verified=false with a message when the debugger could not bind it.",
            inputSchema: {
                file: z.string(),
                line: z.number().int().min(1),
                condition: z.string().optional(),
            },
        },
        args => run('set_breakpoint', args, () => bridge.setBreakpoint(args.file, args.line, args.condition)),
    );

    server.registerTool(
        'clear_breakpoints',
        {
            description: 'Remove breakpoints created through this server, or all breakpoints when all is true.',
            inputSchema: { all: z.boolean().optional() },
        },
        args => run('clear_breakpoints', args, () => ({ removed: bridge.clearBreakpoints(args.all ?? false) })),
    );

    server.registerTool(
        'wait_for_event',
        {
            description:
                'Wait for the next event (only events after the call, or with sinceSeq also already-buffered events newer than sinceSeq, e.g. nextSeq from get_logs taken before run_command). kind=any (default) matches any event (log, stopped, continued, session), optionally matching a regex pattern. Returns { timedOut: true } on timeout.',
            inputSchema: {
                kind: z.enum(['log', 'stopped', 'any']).optional(),
                pattern: z.string().optional(),
                timeoutSeconds: z.number().min(1).max(30).optional(),
                sinceSeq: z.number().int().min(0).optional(),
            },
        },
        args =>
            run('wait_for_event', args, async () => {
                const re = args.pattern ? new RegExp(args.pattern) : undefined;
                const kind = args.kind ?? 'any';
                const event = await bridge.waitForEvent(
                    e => (kind === 'any' || e.kind === kind) && (!re || re.test(e.text)),
                    (args.timeoutSeconds ?? 15) * 1000,
                    args.sinceSeq,
                );
                return event ?? { timedOut: true };
            }),
    );
}
