import { VSCodeButton, VSCodeTextField } from '@vscode/webview-ui-toolkit/react';
import React, { useState, useEffect } from 'react';
import './App.css';

const vscode = acquireVsCodeApi();

interface CommandButton {
    id: string;
    command: string;
}

interface CommandState {
    commandButtons: CommandButton[];
}

function App() {
    const [commandButtons, setCommandButtons] = useState<CommandButton[]>([]);

    // load commands
    useEffect(() => {
        const state = (vscode.getState() as CommandState) || { commandButtons: [] };
        if (state && state.commandButtons) {
            setCommandButtons(state.commandButtons);
        }
    }, []);

    // save commands
    useEffect(() => {
        vscode.setState({ commandButtons });
    }, [commandButtons]);

    //
    // button callbacks
    //

    const onShowDiagnosticsPanel = () => {
        vscode.postMessage({ type: 'show-diagnostics' });
    };

    const onAddCommand = () => {
        setCommandButtons(prevButtons => {
            const newButton: CommandButton = {
                id: `${Date.now()}-${Math.random()}`,
                command: '',
            };
            const newButtons = [...prevButtons, newButton];
            return newButtons;
        });
    };

    const onDeleteCommand = (id: string) => {
        setCommandButtons(prevButtons => {
            const newButtons = prevButtons.filter(button => button.id !== id);
            return newButtons;
        });
    };

    const onCommandChanged = (id: string, event: React.ChangeEvent<HTMLInputElement>) => {
        setCommandButtons(prevButtons => {
            return prevButtons.map(commandButton =>
                commandButton.id === id ? { ...commandButton, command: event.target.value } : commandButton
            );
        });
    };

    const onRunCommand = (command: string) => {
        vscode.postMessage({ type: 'run-minecraft-command', command: command });
    };

    return (
        <main>
            <div className="section-style">
                <h3 className="title-style">Diagnostics</h3>
                <VSCodeButton className="standard-button-style" onClick={onShowDiagnosticsPanel}>
                    Show Diagnostics
                </VSCodeButton>
            </div>
            <div className="section-style">
                <h3 className="title-style">Minecraft Command Shortcuts</h3>
                <VSCodeButton className="standard-button-style" onClick={onAddCommand}>
                    Add Command Shortcut
                </VSCodeButton>
                {commandButtons.map(commandButton => (
                    <div key={commandButton.id} className="command-container-style">
                        <VSCodeTextField
                            type="text"
                            value={commandButton.command}
                            onChange={event =>
                                onCommandChanged(commandButton.id, event as React.ChangeEvent<HTMLInputElement>)
                            }
                            className="command-input-style"
                        />
                        <VSCodeButton
                            className="command-button-style"
                            onClick={() => onRunCommand(commandButton.command)}
                        >
                            Run
                        </VSCodeButton>
                        <VSCodeButton className="delete-button-style" onClick={() => onDeleteCommand(commandButton.id)}>
                            Delete
                        </VSCodeButton>
                    </div>
                ))}
            </div>
        </main>
    );
}

export default App;
