// Copyright (C) Microsoft Corporation.  All rights reserved.

import * as os from 'os';
import * as path from 'path';

enum CharCode {
    Colon = 58,
    UppercaseA = 65,
    UppercaseZ = 90,
    LowercaseA = 97,
    LowercaseZ = 122,
}
/* eslint-enable @typescript-eslint/naming-convention */

function isWindowsDriveLetter(char0: number): boolean {
    return (
        (char0 >= CharCode.UppercaseA && char0 <= CharCode.UppercaseZ) ||
        (char0 >= CharCode.LowercaseA && char0 <= CharCode.LowercaseZ)
    );
}

function hasDriveLetter(path: string, isWindowsOS: boolean): boolean {
    if (isWindowsOS) {
        return isWindowsDriveLetter(path.charCodeAt(0)) && path.charCodeAt(1) === CharCode.Colon;
    }
    return false;
}

export function normalizePath(filePath: string): string {
    if (hasDriveLetter(filePath, os.type() === 'Windows_NT')) {
        return path.normalize(filePath.charAt(0).toUpperCase() + filePath.slice(1));
    }
    return path.normalize(filePath);
}

export function normalizePathForRemote(filePath: string): string {
    // remote debugger expects forward slashes on all platforms
    return filePath.replace(/\\/g, '/');
}

export function isUUID(uuid: string): boolean {
    const regex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/i;
    return regex.test(uuid);
}
