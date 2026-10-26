// Copyright (C) Microsoft Corporation.  All rights reserved.

import { describe, expect, it } from 'vitest';
import { matchesTableSearch } from './table-search';

describe('matchesTableSearch', () => {
    const cells = ['Player Count', 'Active', '12.0'];

    it('shows all rows for an empty or whitespace-only query', () => {
        expect(matchesTableSearch('', cells)).toBe(true);
        expect(matchesTableSearch('   ', cells)).toBe(true);
        expect(matchesTableSearch('', [''])).toBe(true);
    });

    it('matches keys and values without regard to case', () => {
        expect(matchesTableSearch('PLAYER', cells)).toBe(true);
        expect(matchesTableSearch('active', cells)).toBe(true);
        expect(matchesTableSearch('12.0', cells)).toBe(true);
    });

    it('ignores surrounding query whitespace', () => {
        expect(matchesTableSearch('  count  ', cells)).toBe(true);
    });

    it('does not match unrelated rows or across cell boundaries', () => {
        expect(matchesTableSearch('missing', cells)).toBe(false);
        expect(matchesTableSearch('CountActive', cells)).toBe(false);
    });
});
