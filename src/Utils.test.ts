
// Copyright (C) Microsoft Corporation.  All rights reserved.

import * as os from 'os';
import { describe, it, expect } from 'vitest';
import { normalizePath, normalizePathForRemote, isUUID } from './Utils';

describe('Utils', () => {
    describe('normalizePath', () => {
        it('should normalize Windows paths correctly with drive letter', () => {
            expect(normalizePath('C:\\path\\to\\file')).toBe('C:\\path\\to\\file');
            if (os.type() === 'Windows_NT') {
                expect(normalizePath('c:\\path\\to\\file')).toBe('C:\\path\\to\\file');
            }
        });

        it('should normalize non-Windows paths correctly', () => {
            if (os.type() === 'Windows_NT') {
                expect(normalizePath('/path/to/file')).toBe('\\path\\to\\file');
            } else {
                expect(normalizePath('/path/to/file')).toBe('/path/to/file');
            }
        });
    });

    describe('normalizePathForRemote', () => {
        it('should replace backslashes with forward slashes', () => {
            expect(normalizePathForRemote('C:\\path\\to\\file')).toBe('C:/path/to/file');
            expect(normalizePathForRemote('C:/path/to/file')).toBe('C:/path/to/file');
        });
      });

    describe('isUUID', () => {
        it('should return true for valid UUIDs', () => {
            expect(isUUID('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
        });

        it('should return false for invalid UUIDs', () => {
            expect(isUUID('invalid-uuid')).toBe(false);
            expect(isUUID('123e4567-e89b-12d3-a456-42661417400')).toBe(false); // One character short
            expect(isUUID('123e4567-e89b-12d3-a456-4266141740000')).toBe(false); // One character too long
        });
      });
});
