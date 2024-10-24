import React from 'react';
import { VSCodeButton, VSCodeCheckbox } from '@vscode/webview-ui-toolkit/react';
import { Checkbox } from '@vscode/webview-ui-toolkit';

interface AutoReloaderProps {
    onStopAutoReload: () => void;
    onStartAutoReload: () => void;
    isSupported: boolean;
}

const AutoReloaderSelection: React.FC<AutoReloaderProps> = ({ onStartAutoReload, onStopAutoReload, isSupported }) => {
    return (
        <div className="section">
            <h3 className="title">Auto Reloader</h3>
            <VSCodeCheckbox
                disabled={!isSupported}
                onChange={event => {
                    const isChecked = (event.target as Checkbox).checked;
                    if (isChecked) {
                        onStartAutoReload();
                    } else {
                        onStopAutoReload();
                    }
                }}
            />
        </div>
    );
};

export default AutoReloaderSelection;
