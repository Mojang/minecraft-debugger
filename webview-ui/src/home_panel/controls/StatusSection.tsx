// Copyright (C) Microsoft Corporation.  All rights reserved.

import React from 'react';

interface StatusSectionProps {
    debuggerConnected: boolean;
    debuggerListening: boolean;
}

const StatusSection: React.FC<StatusSectionProps> = ({ debuggerConnected, debuggerListening }) => {
    const statusClassName = debuggerConnected ? 'active' : debuggerListening ? 'listening' : 'inactive';
    const statusText = debuggerConnected
        ? 'Minecraft Connected'
        : `Minecraft Disconnected (${debuggerListening ? 'Session Active' : 'No Active Session'})`;

    return (
        <div className="status-container">
            <div className={`status-circle ${statusClassName}`}></div>
            {statusText}
        </div>
    );
};

export default React.memo(StatusSection);
