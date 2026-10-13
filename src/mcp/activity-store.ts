// Copyright (C) Microsoft Corporation.  All rights reserved.

import { ActivityEntry, ActivitySink, McpServerState, McpWebviewMessage } from './types';

// Extension-side buffer of MCP tool activity so the home panel can replay it when (re)opened.
export class ActivityStore implements ActivitySink {
    private _entries: ActivityEntry[] = [];
    private _state: McpServerState = { state: 'off', clientActive: false };
    private _listeners: ((msg: McpWebviewMessage) => void)[] = [];

    constructor(private readonly _capacity = 200) {}

    public onActivity(entry: ActivityEntry): void {
        const index = this._entries.findIndex(e => e.id === entry.id);
        if (index >= 0) {
            this._entries[index] = entry;
        } else {
            this._entries.push(entry);
            if (this._entries.length > this._capacity) {
                this._entries.splice(0, this._entries.length - this._capacity);
            }
        }
        this._notify({ type: 'mcp-activity', entry });
    }

    public onServerState(state: McpServerState): void {
        this._state = state;
        this._notify({ type: 'mcp-state', state });
    }

    public snapshot(): { entries: ActivityEntry[]; state: McpServerState } {
        return { entries: [...this._entries], state: this._state };
    }

    public onChange(listener: (msg: McpWebviewMessage) => void): void {
        this._listeners.push(listener);
    }

    private _notify(msg: McpWebviewMessage): void {
        this._listeners.forEach(l => l(msg));
    }
}
