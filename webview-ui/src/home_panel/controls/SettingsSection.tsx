// Copyright (C) Microsoft Corporation.  All rights reserved.

import React from 'react';
import { VSCodeButton, VSCodeTextField } from '@vscode/webview-ui-toolkit/react';
import { SettingButton } from '../handlers/GameSettingHandlers';

interface SettingSectionProps {
    debuggerConnected: boolean;
    settingButtons: SettingButton[];
    onAddSetting: () => void;
    onEditSetting: (id: string, event: React.ChangeEvent<HTMLInputElement>) => void;
    onEditSettingValue: (id: string, event: React.ChangeEvent<HTMLInputElement>) => void;
    onChangeSetting: (setting: string, value: string) => void;
    onDeleteSetting: (id: string) => void;
}

const SettingSection: React.FC<SettingSectionProps> = ({
    debuggerConnected,
    settingButtons,
    onAddSetting,
    onEditSetting,
    onEditSettingValue,
    onChangeSetting,
    onDeleteSetting,
}) => {
    return (
        <div className="section">
            <h3 className="title">Minecraft Setting Shortcuts</h3>
            <VSCodeButton className="standard-button" onClick={onAddSetting}>
                Add Setting Shortcut
            </VSCodeButton>
            {settingButtons.map(settingButton => (
                <div key={settingButton.id} className="command-container">
                    <VSCodeTextField
                        type="text"
                        value={settingButton.setting}
                        onChange={event =>
                            onEditSetting(settingButton.id, event as React.ChangeEvent<HTMLInputElement>)
                        }
                        className="command-input"
                    />
                    <VSCodeTextField
                        type="text"
                        value={settingButton.value}
                        onChange={event =>
                            onEditSettingValue(settingButton.id, event as React.ChangeEvent<HTMLInputElement>)
                        }
                        className="command-input"
                    />
                    <VSCodeButton
                        className="command-run-button"
                        onClick={() => onChangeSetting(settingButton.setting, settingButton.value)}
                        disabled={!debuggerConnected}
                    >
                        Run
                    </VSCodeButton>
                    <VSCodeButton className="command-delete-button" onClick={() => onDeleteSetting(settingButton.id)}>
                        Delete
                    </VSCodeButton>
                </div>
            ))}
        </div>
    );
};

export default React.memo(SettingSection);
