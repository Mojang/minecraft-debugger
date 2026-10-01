// Copyright (C) Microsoft Corporation.  All rights reserved.

import { describe, it, expect, vi } from 'vitest';
import { parseProjectSettings } from './project-settings';

vi.mock('vscode');

describe('parseProjectSettings', () => {
    it('parses string and object entries', () => {
        const result = parseProjectSettings({
            commandShortcuts: [
                '/time set day',
                { label: 'Clear weather', command: '/weather clear' },
                { command: 'reload' },
            ],
        });
        expect(result.commandShortcuts).toEqual([
            { command: '/time set day' },
            { label: 'Clear weather', command: '/weather clear' },
            { command: 'reload' },
        ]);
    });

    it('skips invalid entries', () => {
        const result = parseProjectSettings({
            commandShortcuts: [1, null, '', '  ', {}, { label: 'x' }, { command: 5 }, ['a'], 'ok', { command: 'c', label: 3 }],
        });
        expect(result.commandShortcuts).toEqual([{ command: 'ok' }, { command: 'c' }]);
    });

    it('returns empty for non-object roots, missing key, or non-array value', () => {
        for (const input of [null, undefined, 'x', 5, [], {}, { commandShortcuts: 'x' }, { other: [] }]) {
            expect(parseProjectSettings(input)).toEqual({ commandShortcuts: [] });
        }
    });

    it('ignores unknown keys', () => {
        expect(parseProjectSettings({ future: true, commandShortcuts: ['a'] })).toEqual({
            commandShortcuts: [{ command: 'a' }],
        });
    });
});
