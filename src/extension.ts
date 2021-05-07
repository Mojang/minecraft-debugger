
// Copyright (C) Microsoft Corporation.  All rights reserved.

import * as vscode from 'vscode';
import { MCConfigProvider } from './MCConfigProvider'
import { MCServerDebugAdapterFactory } from './MCServerDebugAdapterFactory'

// called when extension is activated
//
export function activate(context: vscode.ExtensionContext) {

	// register commands
	context.subscriptions.push(vscode.commands.registerCommand('extension.minecraft-js.getPort', config => {
		return vscode.window.showInputBox({
			placeHolder: "Please enter the port Minecraft is listening on.",
			value: ""
		});
	}));

	// register a configuration provider for the 'minecraft-js' debug type
	const configProvider = new MCConfigProvider();
	context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider("minecraft-js", configProvider));

	// register a debug adapter descriptor factory for 'minecraft-js', this factory creates the DebugSession
	let descriptorFactory = new MCServerDebugAdapterFactory();
	context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory('minecraft-js', descriptorFactory));

	if ('dispose' in descriptorFactory) {
		context.subscriptions.push(descriptorFactory);
	}
}

// called when extension is deactivated
//
export function deactivate() {
}
