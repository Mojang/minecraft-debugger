// Copyright (C) Microsoft Corporation.  All rights reserved.

import * as Net from 'net';
import * as vscode from 'vscode';
import { EventEmitter } from 'stream';
import { Session } from './session';
import { StatsProvider } from './stats/stats-provider';
import { HomeViewProvider } from './panels/home-view-provider';
import { PacketLogger } from './packet-logger';

// Factory for creating a Debug Adapter that runs as a server inside the extension and communicates via a socket.
//
export class ServerDebugAdapterFactory implements vscode.DebugAdapterDescriptorFactory {
    private server?: Net.Server;
    private _homeViewProvider: HomeViewProvider;
    private _statsProvider: StatsProvider;
    private _eventEmitter: EventEmitter;
    private readonly _context: vscode.ExtensionContext;

    constructor(homeViewProvider: HomeViewProvider, statsProvider: StatsProvider, eventEmitter: EventEmitter, context: vscode.ExtensionContext) {
        this._homeViewProvider = homeViewProvider;
        this._statsProvider = statsProvider;
        this._eventEmitter = eventEmitter;
        this._context = context;
    }

    createDebugAdapterDescriptor(): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
        if (!this.server) {
            // start listening on a random port
            this.server = Net.createServer(socket => {
                const config = vscode.workspace.getConfiguration('minecraft-debugger');
                const loggingEnabled = config.get<boolean>('packetLogging.enabled', false);
                let packetLogger: PacketLogger | undefined;
                if (loggingEnabled) {
                    const configuredDir = config.get<string>('packetLogging.logDirectory', '');
                    const logDirectory = configuredDir.trim() !== '' ? configuredDir : this._context.storageUri!.fsPath;
                    packetLogger = new PacketLogger(logDirectory);
                }
                const session = new Session(this._homeViewProvider, this._statsProvider, this._eventEmitter, packetLogger);
                session.setRunAsServer(true);
                session.start(socket as NodeJS.ReadableStream, socket);
            }).listen(0);
        }

        // make VS Code connect to debug server
        return new vscode.DebugAdapterServer((this.server.address() as Net.AddressInfo).port);
    }

    dispose(): void {
        if (this.server) {
            this.server.close();
        }
    }
}
