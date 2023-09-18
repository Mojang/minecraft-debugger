
// Copyright (C) Microsoft Corporation.  All rights reserved.

import * as Net from 'net';
import * as vscode from 'vscode';
import { Session } from './Session';
import { StatsProvider } from './StatsProvider';

// Factory for creating a Debug Adapter that runs as a server inside the extension and communicates via a socket.
//
export class ServerDebugAdapterFactory implements vscode.DebugAdapterDescriptorFactory {

	private server?: Net.Server;

	constructor(private _statProvider: StatsProvider) {}

	createDebugAdapterDescriptor(session: vscode.DebugSession, executable: vscode.DebugAdapterExecutable | undefined): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
		if (!this.server) {
			// start listening on a random port
			this.server = Net.createServer(socket => {
				const session = new Session(this._statProvider);
				session.setRunAsServer(true);
				session.start(socket as NodeJS.ReadableStream, socket);
			}).listen(0);
		}

		// make VS Code connect to debug server
		return new vscode.DebugAdapterServer((this.server.address() as Net.AddressInfo).port);
	}

	dispose() {
		if (this.server) {
			this.server.close();
		}
	}
}
