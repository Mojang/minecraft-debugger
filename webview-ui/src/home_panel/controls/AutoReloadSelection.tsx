import React, { useEffect, useRef, useCallback, memo, } from 'react';
import { VSCodeCheckbox, VSCodeTextField } from '@vscode/webview-ui-toolkit/react';
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

const AutoReloadSelection = memo<AutoReloadProps>(({
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

    const handleCheckboxClick = useCallback<(event: React.MouseEvent<HTMLElement, MouseEvent>) => void>(event => {
        if (!event.target) return
        const isChecked = (event.target as Checkbox).checked;
        setAutoReloadActive(isChecked);
        isChecked ? onStartAutoReload(globPattern, delay) : onStopAutoReload();
    }, [setAutoReloadActive, onStartAutoReload, onStopAutoReload, globPattern, delay]);

    const handleGlobPatternChange = useCallback<(event: Event | React.FormEvent<HTMLElement>) => void>(event => {
        if (!event.target) return
        setAutoReloadGlobPattern((event.target as TextField).value);
    }, [setAutoReloadGlobPattern]);

    const handleDelayChange = useCallback<(delay: string) => void>(delay => {
        if (/^\d*$/.test(delay)) {
            setAutoReloadDelay(parseInt(delay));
        }
    }, [setAutoReloadDelay]);

    useEffect(() => {
        if (checkboxRef.current) {
            (checkboxRef.current as Checkbox).checked = isAutoReloadActive;
        }
    }, [isAutoReloadActive]);

    return (
        <div className="section">
            <h3 className="title">Auto Reload</h3>
            <VSCodeCheckbox
                ref={checkboxRef}
                disabled={!isSupported}
                onClick={handleCheckboxClick}
            />
            <br />
            <div className="auto-relod-button-container">
                <div>
                    <h4 className="sub-title">Glob Pattern</h4>
                    <VSCodeTextField
                        type="text"
                        value={globPattern}
                        onChange={handleGlobPatternChange}
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
});

export default AutoReloadSelection;
