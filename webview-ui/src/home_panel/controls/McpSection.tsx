// Copyright (C) Microsoft Corporation.  All rights reserved.

import React from 'react';
import { VSCodeButton } from '@vscode/webview-ui-toolkit/react';

// Mirrors src/mcp/types.ts (webview is a separate build and cannot import from src/).
export interface ActivityEntry {
    id: number;
    time: number;
    tool: string;
    args: string;
    status: 'running' | 'ok' | 'error';
    durationMs?: number;
    summary?: string;
}

export interface McpServerState {
    state: 'off' | 'listening' | 'error';
    port?: number;
    clientActive: boolean;
    message?: string;
}

interface McpSectionProps {
    entries: ActivityEntry[];
    serverState: McpServerState;
    onCopyConfig: () => void;
    onShowSettings: () => void;
}

const statusText = (s: McpServerState): string => {
    if (s.state === 'listening') {
        return `Listening on 127.0.0.1:${s.port} (${s.clientActive ? 'client active' : 'no client'})`;
    }
    return s.state === 'error' ? `Error: ${s.message ?? 'unknown'}` : 'Off';
};

const McpSection: React.FC<McpSectionProps> = ({ entries, serverState, onCopyConfig, onShowSettings }) => {
    return (
        <div className="section">
            <h3 className="title">MCP Activity</h3>
            <div className={`mcp-status ${serverState.state === 'error' ? 'mcp-entry-error' : ''}`}>
                {statusText(serverState)}
            </div>
            <div className="mcp-button-container">
                <VSCodeButton onClick={onCopyConfig}>Copy Config</VSCodeButton>
                <VSCodeButton onClick={onShowSettings}>Settings</VSCodeButton>
            </div>
            {entries.length === 0 ? (
                <div className="mcp-entry-detail">No MCP activity yet.</div>
            ) : (
                <div className="mcp-list">
                    {entries.map(entry => (
                        <div
                            key={entry.id}
                            className={`mcp-entry ${entry.status === 'error' ? 'mcp-entry-error' : ''}`}
                        >
                            <div>
                                {new Date(entry.time).toLocaleTimeString([], { hour12: false })} {entry.tool}{' '}
                                {entry.status}
                                {entry.durationMs !== undefined ? ` ${entry.durationMs}ms` : ''}
                            </div>
                            <div className="mcp-entry-detail">
                                {entry.args}
                                {entry.status === 'error' && entry.summary ? ` - ${entry.summary}` : ''}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default React.memo(McpSection);
