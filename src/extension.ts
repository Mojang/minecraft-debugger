// Copyright (C) Microsoft Corporation.  All rights reserved.

import * as vscode from 'vscode';
import { ConfigProvider } from './ConfigProvider';
import { ServerDebugAdapterFactory } from './ServerDebugAdapterFactory';
import { HomeViewProvider } from './panels/HomeViewProvider';
import { MinecraftDiagnosticsPanel } from './panels/MinecraftDiagnostics';
import { DebuggerStatsProvider } from './DebuggerStatsProvider';
import { DiagnosticsReportStatsProvider } from './DiagnosticsReportStatsProvider';

// called when extension is activated
//
export function activate(context: vscode.ExtensionContext) {
    // create tree data providers and register them
    const debuggerStatsProvider = new DebuggerStatsProvider();

    // home view
    const homeViewProvider = new HomeViewProvider(context.extensionUri);
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
    let descriptorFactory = new ServerDebugAdapterFactory(debuggerStatsProvider);
    context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory('minecraft-js', descriptorFactory));

    if ('dispose' in descriptorFactory) {
        context.subscriptions.push(descriptorFactory);
    }

    // Create the show diagnostics command
    const showDiagnosticsCommand = vscode.commands.registerCommand(
        'minecraft-debugger.showMinecraftDiagnostics',
        () => {
            MinecraftDiagnosticsPanel.render(context.extensionUri, debuggerStatsProvider);
        }
    );

    const openDiagnosticsCommandCommand = vscode.commands.registerCommand(
        'minecraft-debugger.openMinecraftDiagnosticsReport',
        () => {
            const options: vscode.OpenDialogOptions = {
                canSelectMany: false,
                openLabel: 'Open',
                filters: {
                    'Minecraft Diagnostics Report': ['mcdiag'],
                    'All files': ['*'],
                },
            };

            vscode.window.showOpenDialog(options).then((fileUris: vscode.Uri[] | undefined) => {
                if (fileUris && fileUris[0]) {
                    console.log('Selected file: ' + fileUris[0].fsPath);

                    // Read file data
                    vscode.workspace.fs.readFile(fileUris[0]).then((fileData: Uint8Array) => {
                        const jsonString = Buffer.from(fileData).toString('utf8');
                        const parsedData = JSON.parse(jsonString);

                        // Check if we're an array
                        if (!Array.isArray(parsedData)) {
                            // TODO: Error
                            return;
                        }
                        const fileReport = new DiagnosticsReportStatsProvider(parsedData);
                        MinecraftDiagnosticsPanel.render(context.extensionUri, fileReport);

                        // Hack to delay the eventing until the panel is ready
                        setTimeout(() => {
                            fileReport.startFiringReport();
                        }, 200);
                    });
                }
            });
        }
    );

    const startDiagnosticsRecording = vscode.commands.registerCommand(
        'minecraft-debugger.startMinecraftDiagnosticsRecording',
        () => {
            debuggerStatsProvider.startRecording();
        }
    );

    const stopDiagnosticsRecording = vscode.commands.registerCommand(
        'minecraft-debugger.stopMinecraftDiagnosticsRecording',
        () => {
            debuggerStatsProvider.stopRecording();

            // No data to save, move along citizen
            if (debuggerStatsProvider.getRecordedStats().length <= 0) {
                return;
            }

            const options: vscode.SaveDialogOptions = {
                saveLabel: 'Open',
                filters: {
                    'Minecraft Diagnostics Report': ['mcdiag'],
                },
                title: 'Save Minecraft Diagnostics Report',
            };

            vscode.window.showSaveDialog(options).then((fileUri: vscode.Uri | undefined) => {
                if (fileUri) {
                    const dataToSave = JSON.stringify(debuggerStatsProvider.getRecordedStats());
                    vscode.workspace.fs.writeFile(fileUri, Buffer.from(dataToSave));
                }
            });
        }
    );

    // Add command to the extension context
    context.subscriptions.push(showDiagnosticsCommand);
    context.subscriptions.push(openDiagnosticsCommandCommand);
    context.subscriptions.push(startDiagnosticsRecording);
    context.subscriptions.push(stopDiagnosticsRecording);
}

// called when extension is deactivated
//
export function deactivate() {}
