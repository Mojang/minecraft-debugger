// Copyright (C) Microsoft Corporation.  All rights reserved.

import * as vscode from 'vscode';
import { ConfigProvider } from './config-provider';
import { EventEmitter } from 'stream';
import { HomeViewProvider } from './panels/home-view-provider';
import { MinecraftDiagnosticsPanel } from './panels/minecraft-diagnostics';
import { ServerDebugAdapterFactory } from './server-debug-adapter-factory';
import { StatsProvider } from './stats/stats-provider';
import { ReplayStatsProvider } from './stats/replay-stats-provider';

// called when extension is activated
//
export function activate(context: vscode.ExtensionContext) {
    const liveStatsProvider = new StatsProvider('Live', 'minecraftDiagnosticsLive');
    const eventEmitter: EventEmitter = new EventEmitter();

    // home view
    const homeViewProvider = new HomeViewProvider(context.extensionUri, eventEmitter);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(HomeViewProvider.viewType, homeViewProvider));

    // register a configuration provider for the 'minecraft-js' debug type
    const configProvider = new ConfigProvider();
    context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('minecraft-js', configProvider));

    // register a debug adapter descriptor factory for 'minecraft-js', this factory creates the DebugSession
    let descriptorFactory = new ServerDebugAdapterFactory(homeViewProvider, liveStatsProvider, eventEmitter);
    context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory('minecraft-js', descriptorFactory));
    if ('dispose' in descriptorFactory) {
        context.subscriptions.push(descriptorFactory);
    }

    //
    // Command Registrations
    //

    const getPortCommand = vscode.commands.registerCommand('extension.minecraft-js.getPort', () => {
        return vscode.window.showInputBox({
            placeHolder: 'Please enter the port Minecraft is listening on.',
            value: '',
        });
    });

    const minecraftReloadCommand = vscode.commands.registerCommand('minecraft-debugger.minecraftReload', () => {
        if (!vscode.debug.activeDebugSession) {
            vscode.window.showErrorMessage('Error running command reload: No active Minecraft Debugger session.');
        }
        eventEmitter.emit('run-minecraft-command', 'reload');
    });

    // Create a command to allow keyboard shortcuts to run Minecraft commands
    const runMinecraftCommand = vscode.commands.registerCommand(
        'minecraft-debugger.runMinecraftCommand',
        (...args: any[]) => {
            if (args.length === 0) {
                vscode.window.showErrorMessage('No command provided.');
                return;
            }
            const command = args[0]; // Use only the first argument
            if (typeof command !== 'string') {
                vscode.window.showErrorMessage('Command must be a string.');
                return;
            }
            if (!vscode.debug.activeDebugSession) {
                vscode.window.showErrorMessage('Error running command: No active Minecraft Debugger session.');
            }
            eventEmitter.emit('run-minecraft-command', command);
        }
    );

    const liveDiagnosticsCommand = vscode.commands.registerCommand('minecraft-debugger.liveDiagnostics', () => {
        MinecraftDiagnosticsPanel.render(context.extensionUri, liveStatsProvider);
    });

    const replayDiagnosticsCommand = vscode.commands.registerCommand(
        'minecraft-debugger.replayDiagnostics',
        async () => {
            const fileUri = await vscode.window.showOpenDialog({
                canSelectMany: false,
                openLabel: 'Open',
                filters: {
                    'MC Stats Files': ['mcstats'],
                    'All Files': ['*'],
                },
            });
            if (!fileUri || fileUri.length === 0) {
                vscode.window.showErrorMessage('No file selected.');
                return;
            }
            const replayStats = new ReplayStatsProvider(fileUri[0].fsPath);
            MinecraftDiagnosticsPanel.render(context.extensionUri, replayStats);
        }
    );

    // Add commands to the extension context
    context.subscriptions.push(
        getPortCommand,
        minecraftReloadCommand,
        runMinecraftCommand,
        liveDiagnosticsCommand,
        replayDiagnosticsCommand
    );
}

// called when extension is deactivated
//
export function deactivate() {}
