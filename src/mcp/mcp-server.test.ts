// Copyright (C) Microsoft Corporation.  All rights reserved.

import * as http from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { McpHttpServer, startMcpServer } from './mcp-server';
import { ActivityEntry, DebuggerBridge, McpServerState } from './types';

const TOKEN = 'a'.repeat(64);

function makeBridge(overrides: Partial<DebuggerBridge> = {}): DebuggerBridge {
    return {
        getStatus: () => ({ sessionActive: true, connected: true, supportsCommands: true, paused: false }),
        getEvents: () => ({ events: [], nextSeq: 0 }),
        getStats: () => [],
        waitForEvent: async () => undefined,
        getStack: async () => [],
        getVariables: async () => [],
        evaluate: async () => ({}),
        runCommand: vi.fn(),
        continue: async () => undefined,
        pause: async () => undefined,
        step: async () => undefined,
        setBreakpoint: async (file: string, line: number) => ({ file, line, verified: true }),
        clearBreakpoints: () => 0,
        getCollectors: () => ['entities'],
        setDiagnosticsActive: vi.fn(),
        ...overrides,
    };
}

describe('mcp server', () => {
    let server: McpHttpServer;
    let activity: ActivityEntry[];
    let states: McpServerState[];
    let bridge: DebuggerBridge;

    const start = async (b: DebuggerBridge) => {
        bridge = b;
        server = await startMcpServer({
            port: 0,
            token: TOKEN,
            bridge,
            sink: { onActivity: e => activity.push(e), onServerState: s => states.push(s) },
        });
    };

    const post = (body: unknown, headers: Record<string, string> = {}) =>
        fetch(`http://127.0.0.1:${server.port}/mcp`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                accept: 'application/json, text/event-stream',
                authorization: 'Bearer ' + TOKEN,
                ...headers,
            },
            body: JSON.stringify(body),
        });

    const call = async (name: string, args: Record<string, unknown> = {}) => {
        const res = await post({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });
        expect(res.status).toBe(200);
        return ((await res.json()) as any).result as { isError?: boolean; content: { text: string }[] };
    };

    beforeEach(() => {
        activity = [];
        states = [];
    });
    afterEach(async () => {
        await server.close();
    });

    describe('auth and routing', () => {
        beforeEach(() => start(makeBridge()));
        const rpc = { jsonrpc: '2.0', id: 1, method: 'tools/list' };

        it('rejects missing, short and wrong same-length tokens with 401', async () => {
            const noAuth = await fetch(`http://127.0.0.1:${server.port}/mcp`, {
                method: 'POST',
                headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
                body: JSON.stringify(rpc),
            });
            expect(noAuth.status).toBe(401);
            expect((await post(rpc, { authorization: 'Bearer x' })).status).toBe(401);
            expect((await post(rpc, { authorization: 'Bearer ' })).status).toBe(401);
            expect((await post(rpc, { authorization: 'garbage' })).status).toBe(401);
            expect((await post(rpc, { authorization: 'Bearer ' + 'b'.repeat(64) })).status).toBe(401);
        });

        it('rejects a foreign Origin with 403', async () => {
            expect((await post(rpc, { origin: 'https://evil.example' })).status).toBe(403);
        });

        it('rejects a foreign Host with 403', async () => {
            const status = await new Promise<number>((resolve, reject) => {
                const req = http.request(
                    {
                        host: '127.0.0.1',
                        port: server.port,
                        path: '/mcp',
                        method: 'POST',
                        headers: {
                            host: `evil.example:${server.port}`,
                            authorization: 'Bearer ' + TOKEN,
                            'content-type': 'application/json',
                            accept: 'application/json, text/event-stream',
                        },
                    },
                    res => {
                        res.resume();
                        resolve(res.statusCode ?? 0);
                    },
                );
                req.on('error', reject);
                req.end(JSON.stringify(rpc));
            });
            expect(status).toBe(403);
        });

        it('returns 404 for other paths', async () => {
            const res = await fetch(`http://127.0.0.1:${server.port}/other`);
            expect(res.status).toBe(404);
        });

        it('answers initialize', async () => {
            const res = await post({
                jsonrpc: '2.0',
                id: 1,
                method: 'initialize',
                params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '1' } },
            });
            expect(res.status).toBe(200);
            expect(((await res.json()) as any).result.serverInfo.name).toBe('minecraft-debugger');
        });

        it('reports client activity and off state on close', async () => {
            await post(rpc);
            expect(states.some(s => s.state === 'listening' && s.clientActive)).toBe(true);
            await server.close();
            expect(states[states.length - 1]).toEqual({ state: 'off', clientActive: false });
        });
    });

    describe('tools', () => {
        it('get_status succeeds and reports activity', async () => {
            await start(makeBridge());
            const r = await call('get_status');
            expect(r.content[0].text).toContain('"connected"');
            expect(activity.map(a => a.status)).toEqual(['running', 'ok']);
        });

        it('run_command strips the leading slash', async () => {
            const runCommand = vi.fn();
            await start(makeBridge({ runCommand }));
            const r = await call('run_command', { command: '/say hi' });
            expect(runCommand).toHaveBeenCalledWith('say hi');
            expect(r.isError).toBeFalsy();
        });

        it('returns an error result when the bridge throws, get_status still works', async () => {
            const err = () => {
                throw new Error('No active Minecraft Debugger session');
            };
            await start(makeBridge({ runCommand: err }));
            const r = await call('run_command', { command: 'say hi' });
            expect(r.isError).toBe(true);
            expect(r.content[0].text).toContain('No active Minecraft Debugger session');
            expect((await call('get_status')).isError).toBeFalsy();
        });

        it('set_diagnostics_active forwards collectors and lists known ones', async () => {
            const setDiagnosticsActive = vi.fn();
            await start(makeBridge({ setDiagnosticsActive }));
            const r = await call('set_diagnostics_active', { collectors: ['entities'], active: true });
            expect(setDiagnosticsActive).toHaveBeenCalledWith(['entities'], true);
            expect(r.content[0].text).toContain('"known"');
        });

        it('wait_for_event with an invalid regex is an error result', async () => {
            await start(makeBridge());
            expect((await call('wait_for_event', { pattern: '(' })).isError).toBe(true);
        });
    });
});
