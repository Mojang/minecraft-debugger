// Copyright (C) Microsoft Corporation.  All rights reserved.

import { describe, it, expect, vi } from 'vitest';
import { parseCommandShortcutFiles, parseCommandText, parseProjectSettings } from './project-settings';

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

    it('accepts an array root', () => {
        expect(parseProjectSettings(['a', { command: 'b', label: 'B' }, 3])).toEqual({
            commandShortcuts: [{ command: 'a' }, { label: 'B', command: 'b' }],
        });
    });

    it('ignores unknown keys', () => {
        expect(parseProjectSettings({ future: true, commandShortcuts: ['a'] })).toEqual({
            commandShortcuts: [{ command: 'a' }],
        });
    });
});

describe('parseCommandShortcutFiles', () => {
    it('keeps non-empty strings only', () => {
        expect(parseCommandShortcutFiles({ commandShortcutFiles: ['a.json', '', 4, 'b/*.txt'] })).toEqual([
            'a.json',
            'b/*.txt',
        ]);
    });

    it('returns empty for missing or invalid values', () => {
        for (const input of [null, undefined, [], {}, { commandShortcutFiles: 'a.json' }]) {
            expect(parseCommandShortcutFiles(input)).toEqual([]);
        }
    });
});

describe('parseCommandText', () => {
    it('reads one command per line, skipping blanks and comments', () => {
        const text = '# comment\r\n  time set day  \r\n\r\n/weather clear\n   # indented comment\nsay hi\n';
        expect(parseCommandText(text)).toEqual([
            { command: 'time set day' },
            { command: '/weather clear' },
            { command: 'say hi' },
        ]);
    });
});
