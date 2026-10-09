// Copyright (C) Microsoft Corporation.  All rights reserved.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventBuffer } from './event-buffer';

const Log = (text: string, level?: 'info' | 'warn' | 'error') => ({ kind: 'log' as const, text, level });

describe('EventBuffer', () => {
    afterEach(() => vi.useRealTimers());

    it('assigns increasing seq starting at 1', () => {
        const b = new EventBuffer();
        expect(b.push(Log('a')).seq).toBe(1);
        expect(b.push(Log('b')).seq).toBe(2);
        expect(b.head()).toBe(2);
    });

    it('keeps only the last capacity entries', () => {
        const b = new EventBuffer(3);
        for (let i = 0; i < 5; i++) {
            b.push(Log(String(i)));
        }
        expect(b.since(0, 10).events.map(e => e.text)).toEqual(['2', '3', '4']);
    });

    it('since returns newer events and nextSeq', () => {
        const b = new EventBuffer();
        for (let i = 0; i < 4; i++) {
            b.push(Log(String(i)));
        }
        const r = b.since(2, 10);
        expect(r.events.map(e => e.seq)).toEqual([3, 4]);
        expect(r.nextSeq).toBe(4);
        expect(b.since(4, 10)).toEqual({ events: [], nextSeq: 4 });
    });

    it('since filters by level and honours limit', () => {
        const b = new EventBuffer();
        b.push(Log('a', 'info'));
        b.push(Log('b', 'error'));
        b.push(Log('c', 'error'));
        const r = b.since(0, 1, 'error');
        expect(r.events.map(e => e.text)).toEqual(['b']);
        expect(r.nextSeq).toBe(2);
    });

    it('clear keeps seq monotonic', () => {
        const b = new EventBuffer();
        b.push(Log('a'));
        b.clear();
        expect(b.since(0, 10).events).toEqual([]);
        expect(b.push(Log('b')).seq).toBe(2);
    });

    it('waitFor resolves with an event pushed after the call, ignoring earlier ones', async () => {
        const b = new EventBuffer();
        b.push(Log('hello'));
        const p = b.waitFor(e => e.text === 'hello', 1000);
        b.push(Log('nope'));
        const e = b.push(Log('hello'));
        expect(await p).toEqual(e);
    });

    it('waitFor resolves undefined on timeout', async () => {
        vi.useFakeTimers();
        const b = new EventBuffer();
        const p = b.waitFor(() => true, 500);
        vi.advanceTimersByTime(500);
        expect(await p).toBeUndefined();
    });

    it('waitFor with sinceSeq returns an already-buffered match newer than sinceSeq', async () => {
        const b = new EventBuffer();
        b.push(Log('old'));
        const head = b.head();
        const e = b.push(Log('hit'));
        expect(await b.waitFor(x => x.text === 'hit', 1000, head)).toEqual(e);
    });

    it('waitFor with sinceSeq ignores matches at or before sinceSeq', () => {
        vi.useFakeTimers();
        const b = new EventBuffer();
        b.push(Log('hit'));
        const p = b.waitFor(x => x.text === 'hit', 500, b.head());
        vi.advanceTimersByTime(500);
        return expect(p).resolves.toBeUndefined();
    });
});
