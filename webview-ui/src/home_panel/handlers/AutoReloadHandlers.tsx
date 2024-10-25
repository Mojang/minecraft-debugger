import { useState } from 'react';

export interface AutoReloadHandlers {
    autoReloadGlobPattern: string;
    autoReloadDelay: number;
    isAutoReloadActive: boolean;
    setAutoReloadGlobPattern: (pattern: string) => void;
    setAutoReloadDelay: (delay: number) => void;
    setAutoReloadActive: (isActive: boolean) => void;
}

export const useAutoReloadHandlers = (): AutoReloadHandlers => {
    const [autoReloadGlobPattern, setAutoReloadGlobPattern] = useState<string>('*/**');
    const [autoReloadDelay, setAutoReloadDelay] = useState<number>(250);
    const [isAutoReloadActive, setAutoReloadActive] = useState<boolean>(false);

    return {
        autoReloadGlobPattern,
        autoReloadDelay,
        isAutoReloadActive,
        setAutoReloadGlobPattern,
        setAutoReloadDelay,
        setAutoReloadActive,
    };
};
