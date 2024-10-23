// Copyright (C) Microsoft Corporation.  All rights reserved.

import * as vscode from 'vscode';
import { ConfigProvider } from './ConfigProvider';
import { ServerDebugAdapterFactory } from './ServerDebugAdapterFactory';
import { HomeViewProvider } from './panels/HomeViewProvider';
import { MinecraftDiagnosticsPanel } from './panels/MinecraftDiagnostics';
import { StatsProvider2 } from './StatsProvider2';
import { EventEmitter } from 'stream';

// called when extension is activated
//
export function activate(context: vscode.ExtensionContext) {
    const statsProvider = new StatsProvider2();
    const eventEmitter: EventEmitter = new EventEmitter();

    // home view
    const homeViewProvider = new HomeViewProvider(context.extensionUri, eventEmitter);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(HomeViewProvider.viewType, homeViewProvider));

    // register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('extension.minecraft-js.getPort', _config => {
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
    let descriptorFactory = new ServerDebugAdapterFactory(homeViewProvider, statsProvider, eventEmitter);
    context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory('minecraft-js', descriptorFactory));

    if ('dispose' in descriptorFactory) {
        context.subscriptions.push(descriptorFactory);
    }

    // Create the show diagnostics command
    const showDiagnosticsCommand = vscode.commands.registerCommand(
        'minecraft-debugger.showMinecraftDiagnostics',
        () => {
            MinecraftDiagnosticsPanel.render(context.extensionUri, statsProvider);
        }
    );

    const minecraftReloadCommand = vscode.commands.registerCommand('minecraft-debugger.minecraftReload', () => {
        if (!vscode.debug.activeDebugSession) {
            vscode.window.showErrorMessage('Error running command reload: No active Minecraft Debugger session.');
        }
        eventEmitter.emit('run-minecraft-command', 'reload');
    });

    // Add command to the extension context
    context.subscriptions.push(showDiagnosticsCommand, minecraftReloadCommand);
}

// called when extension is deactivated
//
export function deactivate() {}
