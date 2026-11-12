// Copyright (C) Microsoft Corporation.  All rights reserved.

import { createHash, timingSafeEqual } from 'crypto';
import * as http from 'http';
import { AddressInfo } from 'net';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { registerTools } from './mcp-tools';
import { ActivitySink, DebuggerBridge } from './types';

export interface McpHttpServer {
    readonly port: number;
    close(): Promise<void>;
}

const CLIENT_IDLE_MS = 60_000;

const Sha256 = (s: string) => createHash('sha256').update(s).digest();

function reply(res: http.ServerResponse, status: number, message: string): void {
    res.writeHead(status, { 'content-type': 'text/plain' }).end(message);
}

function isLoopbackOrigin(origin: string): boolean {
    try {
        const host = new URL(origin).hostname;
        return host === '127.0.0.1' || host === 'localhost';
    } catch {
        return false;
    }
}

export function startMcpServer(opts: {
    port: number;
    token: string;
    bridge: DebuggerBridge;
    sink: ActivitySink;
}): Promise<McpHttpServer> {
    const { token, bridge, sink } = opts;
    const expectedDigest = Sha256(token);
    let actualPort = opts.port;
    let idleTimer: NodeJS.Timeout | undefined;

    const markClientActive = () => {
        if (!idleTimer) {
            sink.onServerState({ state: 'listening', port: actualPort, clientActive: true });
        }
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
            idleTimer = undefined;
            sink.onServerState({ state: 'listening', port: actualPort, clientActive: false });
        }, CLIENT_IDLE_MS);
        idleTimer.unref();
    };

    const authorized = (req: http.IncomingMessage): boolean => {
        const match = /^bearer\s+(.+)$/i.exec(req.headers.authorization ?? '');
        // Digests have equal length, so timingSafeEqual never throws.
        return !!match && timingSafeEqual(Sha256(match[1]), expectedDigest);
    };

    const handle = async (req: http.IncomingMessage, res: http.ServerResponse) => {
        if (new URL(req.url ?? '/', 'http://localhost').pathname !== '/mcp') {
            return reply(res, 404, 'Not found');
        }
        if (req.headers.host !== `127.0.0.1:${actualPort}` && req.headers.host !== `localhost:${actualPort}`) {
            return reply(res, 403, 'Forbidden host');
        }
        if (req.headers.origin !== undefined && !isLoopbackOrigin(req.headers.origin)) {
            return reply(res, 403, 'Forbidden origin');
        }
        if (!authorized(req)) {
            return reply(res, 401, 'Unauthorized');
        }
        markClientActive();

        // Stateless: a fresh server + transport per request.
        const server = new McpServer({ name: 'minecraft-debugger', version: '1.0.0' });
        registerTools(server, bridge, sink);
        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
            enableJsonResponse: true,
        });
        res.on('close', () => {
            void transport.close();
            void server.close();
        });
        await server.connect(transport);
        await transport.handleRequest(req, res);
    };

    const httpServer = http.createServer((req, res) => {
        handle(req, res).catch(() => {
            if (!res.headersSent) {
                reply(res, 500, 'Internal server error');
            } else {
                res.end();
            }
        });
    });

    return new Promise((resolve, reject) => {
        httpServer.once('error', reject);
        httpServer.listen(opts.port, '127.0.0.1', () => {
            httpServer.off('error', reject);
            actualPort = (httpServer.address() as AddressInfo).port;
            sink.onServerState({ state: 'listening', port: actualPort, clientActive: false });
            resolve({
                port: actualPort,
                close: () =>
                    new Promise<void>(done => {
                        clearTimeout(idleTimer);
                        httpServer.close(() => {
                            sink.onServerState({ state: 'off', clientActive: false });
                            done();
                        });
                        httpServer.closeAllConnections();
                    }),
            });
        });
    });
}
