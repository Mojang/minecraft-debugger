import React, { useEffect, useRef, useState } from 'react';
import { VSCodeButton, VSCodeCheckbox, VSCodeTextField } from '@vscode/webview-ui-toolkit/react';
import { Checkbox, TextField } from '@vscode/webview-ui-toolkit';

interface AutoReloadProps {
    onStopAutoReload: () => void;
    onStartAutoReload: (globPattern: string, delay: number) => void;

    setAutoReloadGlobPattern: (pattern: string) => void;
    setAutoReloadDelay: (delay: number) => void;

    setAutoReloadActive: (isActive: boolean) => void;

    globPattern: string;
    delay: number;

    isAutoReloadActive: boolean;
    isSupported: boolean;
}

const AutoReloadSelection: React.FC<AutoReloadProps> = ({
    onStartAutoReload,
    onStopAutoReload,
    setAutoReloadGlobPattern,
    setAutoReloadDelay,
    setAutoReloadActive,
    globPattern,
    delay,
    isAutoReloadActive,
    isSupported,
}) => {
    const checkboxRef = useRef(null);

    const handleDelayChange = (value: string): void => {
        if (/^\d*$/.test(value)) {
            const delayNumber = parseInt(value);
            setAutoReloadDelay(delayNumber);
        }
    };

    useEffect(() => {
        if (!checkboxRef || !checkboxRef.current) return;
        (checkboxRef.current as Checkbox).checked = isAutoReloadActive;
    }, [isAutoReloadActive]);

    return (
        <div className="section">
            <h3 className="title">Auto Reload</h3>
            <VSCodeCheckbox
                ref={checkboxRef}
                disabled={!isSupported}
                onClick={event => {
                    const isChecked = (event.target as Checkbox).checked;
                    setAutoReloadActive(isChecked);
                    if (isChecked) {
                        onStartAutoReload(globPattern, delay);
                    } else {
                        onStopAutoReload();
                    }
                }}
            />
            <br />
            <div className="auto-relod-button-container">
                <div>
                    <h4 className="sub-title">Glob Pattern</h4>
                    <VSCodeTextField
                        type="text"
                        value={globPattern}
                        onChange={event => setAutoReloadGlobPattern((event.target! as TextField).value)}
                        disabled={isAutoReloadActive}
                        className="capture-path-input"
                    />
                </div>
                <div>
                    <h4 className="sub-title">Delay In ms</h4>
                    <VSCodeTextField
                        type="text"
                        value={delay.toString()}
                        onChange={event => handleDelayChange((event.target! as TextField).value)}
                        disabled={isAutoReloadActive}
                        className="capture-path-input"
                    />
                </div>
            </div>
        </div>
    );
};

export default AutoReloadSelection;
