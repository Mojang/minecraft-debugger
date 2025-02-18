// Copyright (C) Microsoft Corporation.  All rights reserved.

import * as Net from 'net';
import * as vscode from 'vscode';
import { EventEmitter } from 'stream';
import { Session } from './session';
import { StatsProvider } from './stats/stats-provider';
import { HomeViewProvider } from './panels/home-view-provider';

// Factory for creating a Debug Adapter that runs as a server inside the extension and communicates via a socket.
//
export class ServerDebugAdapterFactory implements vscode.DebugAdapterDescriptorFactory {
    private server?: Net.Server;
    private _homeViewProvider: HomeViewProvider;
    private _statsProvider: StatsProvider;
    private _eventEmitter: EventEmitter;

    constructor(homeViewProvider: HomeViewProvider, statsProvider: StatsProvider, eventEmitter: EventEmitter) {
        this._homeViewProvider = homeViewProvider;
        this._statsProvider = statsProvider;
        this._eventEmitter = eventEmitter;
    }

    createDebugAdapterDescriptor(): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
        if (!this.server) {
            // start listening on a random port
            this.server = Net.createServer(socket => {
                const session = new Session(this._homeViewProvider, this._statsProvider, this._eventEmitter);
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
