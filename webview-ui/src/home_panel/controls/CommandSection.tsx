
// Copyright (C) Microsoft Corporation.  All rights reserved.

import React from 'react';
import { VSCodeButton, VSCodeTextField } from '@vscode/webview-ui-toolkit/react';
import { CommandButton } from '../handlers/CommandHandlers';

interface CommandSectionProps {
    debuggerConnected: boolean;
    supportsCommands: boolean;
    commandButtons: CommandButton[];
    onAddCommand: () => void;
    onEditCommand: (id: string, event: React.ChangeEvent<HTMLInputElement>) => void;
    onRunCommand: (command: string) => void;
    onDeleteCommand: (id: string) => void;
}

const CommandSection: React.FC<CommandSectionProps> = ({
    debuggerConnected,
    supportsCommands,
    commandButtons,
    onAddCommand,
    onEditCommand,
    onRunCommand,
    onDeleteCommand,
}) => {
    return (
        <div className="section">
            <h3 className="title">Minecraft Command Shortcuts</h3>
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
}

export default CommandSection;
