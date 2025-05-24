// Copyright (C) Microsoft Corporation.  All rights reserved.

import { useCallback, useState } from 'react';

export interface SettingButton {
    id: string;
    setting: string;
    value: string;
}

export interface GameSettingHandlers {
    settingButtons: SettingButton[];
    setSettingButtons: (buttons: SettingButton[]) => void;
    onAddSetting: () => void;
    onDeleteSetting: (id: string) => void;
    onEditSetting: (id: string, event: React.ChangeEvent<HTMLInputElement>) => void;
    onEditSettingValue: (id: string, event: React.ChangeEvent<HTMLInputElement>) => void;
}

export const getGameSettingHandlers = (): GameSettingHandlers => {
    const [settingButtons, setSettingButtons] = useState<SettingButton[]>([]);

    const onAddSetting = useCallback(() => {
        setSettingButtons(prevButtons => {
            const newButton: SettingButton = {
                id: `${Date.now()}-${Math.random()}`,
                setting: '',
                value: '',
            };
            const newButtons = [...prevButtons, newButton];
            return newButtons;
        });
    }, []);

    const onDeleteSetting = useCallback((id: string) => {
        setSettingButtons(prevButtons => {
            const newButtons = prevButtons.filter(button => button.id !== id);
            return newButtons;
        });
    }, []);

    const onEditSetting = useCallback((id: string, event: React.ChangeEvent<HTMLInputElement>) => {
        setSettingButtons(prevButtons => {
            return prevButtons.map(button => (button.id === id ? { ...button, setting: event.target.value } : button));
        });
    }, []);

    const onEditSettingValue = useCallback((id: string, event: React.ChangeEvent<HTMLInputElement>) => {
        setSettingButtons(prevButtons => {
            return prevButtons.map(button => (button.id === id ? { ...button, value: event.target.value } : button));
        });
    }, []);

    return {
        settingButtons,
        setSettingButtons,
        onAddSetting,
        onDeleteSetting,
        onEditSetting,
        onEditSettingValue,
    };
};
