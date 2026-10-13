// Copyright (C) Microsoft Corporation.  All rights reserved.

import React from 'react';
import { VSCodeButton, VSCodeTextField } from '@vscode/webview-ui-toolkit/react';
import { CommandButton } from '../handlers/CommandHandlers';

export interface ProjectCommand {
    label?: string;
    command: string;
}

interface CommandSectionProps {
    debuggerConnected: boolean;
    supportsCommands: boolean;
    projectCommands: ProjectCommand[];
    commandButtons: CommandButton[];
    onAddCommand: () => void;
    onEditCommand: (id: string, event: React.ChangeEvent<HTMLInputElement>) => void;
    onRunCommand: (command: string) => void;
    onDeleteCommand: (id: string) => void;
}

const CommandSection: React.FC<CommandSectionProps> = ({
    debuggerConnected,
    supportsCommands,
    projectCommands,
    commandButtons,
    onAddCommand,
    onEditCommand,
    onRunCommand,
    onDeleteCommand,
}) => {
    return (
        <div className="section">
            <h3 className="title">Minecraft Command Shortcuts</h3>
            {projectCommands.length > 0 && <h4 className="sub-title">From project (minecraft-debugger.json)</h4>}
            {projectCommands.map((projectCommand, index) => (
                <div key={index} className="command-container">
                    <span className="command-input">{projectCommand.label ?? projectCommand.command}</span>
                    <VSCodeButton
                        className="command-run-button"
                        onClick={() => onRunCommand(projectCommand.command)}
                        disabled={!debuggerConnected || !supportsCommands}
                    >
                        Run
                    </VSCodeButton>
                </div>
            ))}
            <VSCodeButton className="standard-button" onClick={onAddCommand}>
                Add Command Shortcut
            </VSCodeButton>
            {commandButtons.map(commandButton => (
                <div key={commandButton.id} className="command-container">
                    <VSCodeTextField
                        type="text"
                        value={commandButton.command}
                        onChange={event =>
                            onEditCommand(commandButton.id, event as React.ChangeEvent<HTMLInputElement>)
                        }
                        className="command-input"
                    />
                    <VSCodeButton
                        className="command-run-button"
                        onClick={() => onRunCommand(commandButton.command)}
                        disabled={!debuggerConnected || !supportsCommands}
                    >
                        Run
                    </VSCodeButton>
                    <VSCodeButton className="command-delete-button" onClick={() => onDeleteCommand(commandButton.id)}>
                        Delete
                    </VSCodeButton>
                </div>
            ))}
        </div>
    );
};

export default React.memo(CommandSection);
