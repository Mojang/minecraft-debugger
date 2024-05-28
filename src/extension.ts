// Copyright (C) Microsoft Corporation.  All rights reserved.

import * as vscode from 'vscode';
import { ConfigProvider } from './ConfigProvider';
import { ServerDebugAdapterFactory } from './ServerDebugAdapterFactory';
import { MinecraftDiagnosticsPanel } from './panels/MinecraftDiagnostics';
import { StatsProvider2 } from './StatsProvider2';

// called when extension is activated
//
export function activate(context: vscode.ExtensionContext) {
    // create tree data providers and register them
    const statProvider2 = new StatsProvider2();

    // register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('extension.minecraft-js.getPort', config => {
            return vscode.window.showInputBox({
                placeHolder: 'Please enter the port Minecraft is listening on.',
                value: '',
            });
        })
    );

    // register a configuration provider for the 'minecraft-js' debug type
    const configProvider = new ConfigProvider();
    context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('minecraft-js', configProvider));

    // register a debug adapter descriptor factory for 'minecraft-js', this factory creates the DebugSession
    let descriptorFactory = new ServerDebugAdapterFactory(statProvider2);
    context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory('minecraft-js', descriptorFactory));

    if ('dispose' in descriptorFactory) {
        context.subscriptions.push(descriptorFactory);
    }

    // Create the show hello world command
    const showHelloWorldCommand = vscode.commands.registerCommand('minecraft-debugger.showMinecraftDiagnostics', () => {
        MinecraftDiagnosticsPanel.render(context.extensionUri, statProvider2);
    });

    // Add command to the extension context
    context.subscriptions.push(showHelloWorldCommand);
}

// called when extension is deactivated
//
export function deactivate() {}
