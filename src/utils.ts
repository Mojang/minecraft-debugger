
// Copyright (C) Microsoft Corporation.  All rights reserved.

import * as os from 'os';
import * as path from 'path';

const enum CharCode {
	Colon = 58,
	A = 65,
	Z = 90,
	a = 97,
	z = 122
}

function isWindowsDriveLetter(char0: number): boolean {
	return char0 >= CharCode.A && char0 <= CharCode.Z || char0 >= CharCode.a && char0 <= CharCode.z;
}

function hasDriveLetter(path: string, isWindowsOS: boolean): boolean {
	if (isWindowsOS) {
		return isWindowsDriveLetter(path.charCodeAt(0)) && path.charCodeAt(1) === CharCode.Colon;
	}
	return false;
}

export function normalizePath(filePath: string): string {
	if (hasDriveLetter(filePath, os.type() == 'Windows_NT')) {
		return path.normalize(filePath.charAt(0).toUpperCase() + filePath.slice(1));
	}
    return path.normalize(filePath);
}

export function normalizePathForRemote(filePath: string) {
	// remote debugger expects forward slashes on all platforms
	return filePath.replace(/\\/g,"/");
}

export function isUUID(uuid: string) {
	const regex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/i;
	return regex.test(uuid);
}
