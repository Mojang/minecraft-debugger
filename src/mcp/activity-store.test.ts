// Copyright (C) Microsoft Corporation.  All rights reserved.

import { describe, expect, it, vi } from 'vitest';
import { ActivityStore } from './activity-store';
import { ActivityEntry } from './types';

const MakeEntry = (id: number, status: ActivityEntry['status'] = 'running'): ActivityEntry => ({
    id,
    time: 0,
    tool: 'get_status',
    args: '{}',
    status,
});

describe('ActivityStore', () => {
    it('appends entries', () => {
        const store = new ActivityStore();
        store.onActivity(MakeEntry(1));
        store.onActivity(MakeEntry(2));
        expect(store.snapshot().entries.map(e => e.id)).toEqual([1, 2]);
    });

    it('replaces an entry with the same id in place', () => {
        const store = new ActivityStore();
        store.onActivity(MakeEntry(1));
        store.onActivity(MakeEntry(2));
        store.onActivity(MakeEntry(1, 'ok'));
        const { entries } = store.snapshot();
        expect(entries.map(e => e.id)).toEqual([1, 2]);
        expect(entries[0].status).toBe('ok');
    });

    it('keeps only the newest entries up to capacity', () => {
        const store = new ActivityStore(2);
        [1, 2, 3].forEach(id => store.onActivity(MakeEntry(id)));
        expect(store.snapshot().entries.map(e => e.id)).toEqual([2, 3]);
    });

    it('updates server state in the snapshot', () => {
        const store = new ActivityStore();
        expect(store.snapshot().state).toEqual({ state: 'off', clientActive: false });
        store.onServerState({ state: 'listening', port: 1, clientActive: true });
        expect(store.snapshot().state).toEqual({ state: 'listening', port: 1, clientActive: true });
    });

    it('notifies listeners', () => {
        const store = new ActivityStore();
        const listener = vi.fn();
        store.onChange(listener);
        store.onActivity(MakeEntry(1));
        store.onServerState({ state: 'off', clientActive: false });
        expect(listener).toHaveBeenNthCalledWith(1, { type: 'mcp-activity', entry: MakeEntry(1) });
        expect(listener).toHaveBeenNthCalledWith(2, { type: 'mcp-state', state: { state: 'off', clientActive: false } });
    });
});
