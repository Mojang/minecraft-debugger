
// Copyright (C) Microsoft Corporation.  All rights reserved.

import { useCallback, useState } from 'react';

export interface CommandButton {
    id: string;
    command: string;
}

export interface CommandHandlers {
    commandButtons: CommandButton[];
    setCommandButtons: (buttons: CommandButton[]) => void;
    onAddCommand: () => void;
    onDeleteCommand: (id: string) => void;
    onEditCommand: (id: string, event: React.ChangeEvent<HTMLInputElement>) => void;
}

export const getCommandHandlers = (): CommandHandlers => {

    const [commandButtons, setCommandButtons] = useState<CommandButton[]>([]);

    const onAddCommand = useCallback(() => {
        setCommandButtons(prevButtons => {
            const newButton: CommandButton = {
                id: `${Date.now()}-${Math.random()}`,
                command: '',
            };
            const newButtons = [...prevButtons, newButton];
            return newButtons;
        });
    }, []);

    const onDeleteCommand = useCallback((id: string) => {
        setCommandButtons(prevButtons => {
            const newButtons = prevButtons.filter(button => button.id !== id);
            return newButtons;
        });
    }, []);

    const onEditCommand = useCallback((id: string, event: React.ChangeEvent<HTMLInputElement>) => {
        setCommandButtons(prevButtons => {
            return prevButtons.map(button =>
                button.id === id ? { ...button, command: event.target.value } : button
            );
        });
    }, []);

    return {
        commandButtons,
        setCommandButtons,
        onAddCommand,
        onDeleteCommand,
        onEditCommand
    }
};