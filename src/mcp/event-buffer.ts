// Copyright (C) Microsoft Corporation.  All rights reserved.

import { DebugEvent, LogLevel } from './types';

export class EventBuffer {
    private _events: DebugEvent[] = [];
    private _seq = 0;
    private _waiters = new Set<(e: DebugEvent) => void>();

    constructor(private readonly _capacity = 1000) {}

    push(e: Omit<DebugEvent, 'seq' | 'time'>): DebugEvent {
        const event: DebugEvent = { ...e, seq: ++this._seq, time: Date.now() };
        this._events.push(event);
        if (this._events.length > this._capacity) {
            this._events.splice(0, this._events.length - this._capacity);
        }
        for (const w of [...this._waiters]) {
            w(event);
        }
        return event;
    }

    since(sinceSeq: number, limit: number, level?: LogLevel): { events: DebugEvent[]; nextSeq: number } {
        sinceSeq = this._cursor(sinceSeq);
        const events = this._events.filter(e => e.seq > sinceSeq && (!level || e.level === level)).slice(0, limit);
        // truncated by limit: resume after the last returned event; otherwise everything was scanned
        return { events, nextSeq: events.length === limit ? events[events.length - 1].seq : this._seq };
    }

    // A cursor ahead of the newest seq comes from before a reset (window reload): read from the start.
    private _cursor(sinceSeq: number): number {
        return sinceSeq > this._seq ? 0 : sinceSeq;
    }

    head(): number {
        return this._seq;
    }

    // With sinceSeq, an already-buffered match newer than sinceSeq resolves immediately.
    waitFor(match: (e: DebugEvent) => boolean, timeoutMs: number, sinceSeq?: number): Promise<DebugEvent | undefined> {
        if (sinceSeq !== undefined) {
            const cursor = this._cursor(sinceSeq);
            const buffered = this._events.find(e => e.seq > cursor && match(e));
            if (buffered) {
                return Promise.resolve(buffered);
            }
        }
        return new Promise(resolve => {
            const done = (e?: DebugEvent) => {
                clearTimeout(timer);
                this._waiters.delete(listener);
                resolve(e);
            };
            const listener = (e: DebugEvent) => {
                if (match(e)) {
                    done(e);
                }
            };
            const timer = setTimeout(() => done(undefined), timeoutMs);
            this._waiters.add(listener);
        });
    }

    // Keeps seq monotonic.
    clear(): void {
        this._events = [];
    }
}
