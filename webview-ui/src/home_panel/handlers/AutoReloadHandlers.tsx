import { useState } from 'react';

export interface AutoReloadHandlers {
    autoReloadGlobPattern: string;
    autoReloadDelay: number;
    isAutoReloadActive: boolean;
    onAutoReloadGlobPatternEdited: (pattern: string) => void;
    onAutoReloadDelayEdited: (delay: number) => void;
    setAutoReloadActive: (isActive: boolean) => void;
}

export const getAutoReloadHandlers = (): AutoReloadHandlers => {
    const [autoReloadGlobPattern, onAutoReloadGlobPatternEdited] = useState<string>('*/**');
    const [autoReloadDelay, onAutoReloadDelayEdited] = useState<number>(250);
    const [isAutoReloadActive, setAutoReloadActive] = useState<boolean>(false);

    return {
        autoReloadGlobPattern,
        autoReloadDelay,
        isAutoReloadActive,
        onAutoReloadGlobPatternEdited,
        onAutoReloadDelayEdited,
        setAutoReloadActive,
    };
};
