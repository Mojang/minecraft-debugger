
// Copyright (C) Microsoft Corporation.  All rights reserved.

import * as vscode from 'vscode';

// Intercepts the launch.json configuration used to launch the debug session type 'minecraft-js'
// Custom fields specified in package.json.
//
export class ConfigProvider implements vscode.DebugConfigurationProvider {

	resolveDebugConfiguration(folder: vscode.WorkspaceFolder | undefined, config: vscode.DebugConfiguration, token?: vscode.CancellationToken): vscode.ProviderResult<vscode.DebugConfiguration> {

		// set some defaults to allow attach without a launch.json
		if (!config.type) {
			config.type = 'minecraft-js';
		}
		if (!config.request) {
			config.request = 'attach';
		}
		if (!config.name) {
			config.name = 'Attach to Minecraft';
		}
		if (!config.localRoot) {
			config.localRoot = "${workspaceFolder}/scripts/";
		}
		if (!config.port) {
			config.inputPort = "${command:PromptForPort}"; // prompt user for port
		}

		return config;
	}
}
